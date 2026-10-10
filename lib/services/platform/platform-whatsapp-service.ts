import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

const CONFIGURATION_ID = "default";
const DEFAULT_NAMESPACE = "decc5535_5d4b_402c_9592_3165bf9c35e4";
const CAMPAIGN_MESSAGE_LIMIT = 500;
const SCHEDULE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const MSG91_TEMPLATE_ENDPOINT =
  "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

export type PlatformWhatsAppTemplateInput = {
  templateName: string;
  sampleTemplateText: string;
  integratedNumber: string;
  imageUrl: string;
  languageCode: string;
  isActive: boolean;
};

async function requireWhatsAppPlatformAdmin() {
  const admin = await requirePlatformSessionAdmin();
  if (admin.team_role === "CTO") {
    throw new Error("WhatsApp campaign access is not available to the CTO team.");
  }
  return admin;
}

function normalizeTemplate(input: PlatformWhatsAppTemplateInput) {
  const templateName = input.templateName.trim();
  const sampleTemplateText = input.sampleTemplateText.trim();
  const integratedNumber = input.integratedNumber.trim().replace(/[()\s-]/g, "");
  const imageUrl = input.imageUrl.trim();
  const languageCode = input.languageCode.trim();

  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(templateName)) {
    throw new Error("Template name may contain letters, numbers, underscores, and hyphens.");
  }
  if (!sampleTemplateText || sampleTemplateText.length > 5000) {
    throw new Error("Enter sample template text up to 5000 characters.");
  }
  if (!/^\+?\d{7,15}$/.test(integratedNumber)) {
    throw new Error("Enter the MSG91 integrated WhatsApp number with country code.");
  }
  if (imageUrl.length > 2048) {
    throw new Error("Image URL must be 2048 characters or fewer.");
  }
  if (imageUrl) {
    let parsedImageUrl: URL;
    try {
      parsedImageUrl = new URL(imageUrl);
    } catch {
      throw new Error("Image URL must be a valid HTTPS URL.");
    }
    if (parsedImageUrl.protocol !== "https:" || parsedImageUrl.username || parsedImageUrl.password) {
      throw new Error("Image URL must be a valid HTTPS URL.");
    }
  }
  if (!/^[a-zA-Z]{2,3}(?:[_-][a-zA-Z]{2,8})?$/.test(languageCode)) {
    throw new Error("Enter a valid language code such as en or en_US.");
  }

  return {
    template_name: templateName,
    sample_template_text: sampleTemplateText,
    integrated_number: integratedNumber,
    image_url: imageUrl || null,
    language_code: languageCode,
    is_active: input.isActive === true,
  };
}

function normalizeScheduledAt(value: string) {
  const scheduledAt = new Date(value);
  const now = Date.now();
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Enter a valid campaign send time.");
  }
  if (scheduledAt.getTime() < now - 60_000) {
    throw new Error("Campaign send time cannot be in the past.");
  }
  if (scheduledAt.getTime() > now + SCHEDULE_WINDOW_MS) {
    throw new Error("Campaign send time must be within the next 365 days.");
  }
  return scheduledAt;
}

function normalizeMobile(value: string | null) {
  const digits = value?.trim().replace(/[^\d]/g, "") ?? "";
  if (digits.length === 10) return `91${digits}`;
  return /^\d{11,15}$/.test(digits) && digits[0] !== "0" ? digits : null;
}

function readProviderRequestId(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  const value = body.request_id ?? body.requestId ?? body.message_id ?? body.id;
  return typeof value === "string" && value.length > 0 && value.length <= 255
    ? value
    : null;
}

export async function getPlatformWhatsAppSettings() {
  await requireWhatsAppPlatformAdmin();
  const configuration = await prisma.platformWhatsAppConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
    select: {
      id: true,
      api_key_encrypted: true,
      namespace: true,
      callback_token_hash: true,
      updated_at: true,
    },
  });
  return {
    hasApiKey: Boolean(configuration?.api_key_encrypted),
    namespace: configuration?.namespace ?? DEFAULT_NAMESPACE,
    hasDeliveryCallback: Boolean(configuration?.callback_token_hash),
    updatedAt: configuration?.updated_at ?? null,
  };
}

export async function savePlatformWhatsAppSettings(input: {
  apiKey: string;
  namespace: string;
}) {
  const admin = await requireWhatsAppPlatformAdmin();
  const apiKey = input.apiKey.trim();
  const namespace = input.namespace.trim();
  if (apiKey.length > 2500) throw new Error("MSG91 API key must be 2500 characters or fewer.");
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(namespace)) {
    throw new Error("Enter a valid MSG91 template namespace.");
  }

  const current = await prisma.platformWhatsAppConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
  });
  const encryptedApiKey = apiKey ? encryptSecret(apiKey) : current?.api_key_encrypted;
  if (!encryptedApiKey) throw new Error("Enter an MSG91 API key before saving settings.");

  await prisma.$transaction(async (transaction) => {
    await transaction.platformWhatsAppConfiguration.upsert({
      where: { id: CONFIGURATION_ID },
      create: {
        id: CONFIGURATION_ID,
        api_key_encrypted: encryptedApiKey,
        namespace,
      },
      update: {
        api_key_encrypted: encryptedApiKey,
        namespace,
      },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_WHATSAPP_SETTINGS_UPDATED",
        entity_type: "PlatformWhatsAppConfiguration",
        entity_id: CONFIGURATION_ID,
        details: { apiKeyUpdated: Boolean(apiKey), namespaceUpdated: true },
      },
    });
  });

  return { hasApiKey: true, namespace };
}

export async function listPlatformWhatsAppTemplates(activeOnly = false) {
  await requireWhatsAppPlatformAdmin();
  return prisma.platformWhatsAppTemplate.findMany({
    where: activeOnly ? { is_active: true } : undefined,
    orderBy: [{ template_name: "asc" }, { language_code: "asc" }],
  });
}

export async function savePlatformWhatsAppTemplate(
  input: PlatformWhatsAppTemplateInput,
  templateId?: string,
) {
  const admin = await requireWhatsAppPlatformAdmin();
  const data = normalizeTemplate(input);
  const id = templateId?.trim();
  if (templateId !== undefined && (!id || id.length > 255)) {
    throw new Error("Select a valid WhatsApp template.");
  }

  return prisma.$transaction(async (transaction) => {
    const template = id
      ? await transaction.platformWhatsAppTemplate.update({
          where: { id },
          data,
        })
      : await transaction.platformWhatsAppTemplate.create({ data });

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: id ? "PLATFORM_WHATSAPP_TEMPLATE_UPDATED" : "PLATFORM_WHATSAPP_TEMPLATE_CREATED",
        entity_type: "PlatformWhatsAppTemplate",
        entity_id: template.id,
        details: {
          templateName: template.template_name,
          languageCode: template.language_code,
          active: template.is_active,
        },
      },
    });
    return template;
  });
}

export async function setPlatformWhatsAppTemplateActive(templateId: string, isActive: boolean) {
  const admin = await requireWhatsAppPlatformAdmin();
  const id = templateId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid WhatsApp template.");

  return prisma.$transaction(async (transaction) => {
    const template = await transaction.platformWhatsAppTemplate.update({
      where: { id },
      data: { is_active: isActive },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: isActive ? "PLATFORM_WHATSAPP_TEMPLATE_ACTIVATED" : "PLATFORM_WHATSAPP_TEMPLATE_DEACTIVATED",
        entity_type: "PlatformWhatsAppTemplate",
        entity_id: template.id,
        details: { templateName: template.template_name },
      },
    });
    return template;
  });
}

export async function schedulePlatformWhatsAppCampaignMessage(input: {
  campaignId: string;
  templateId: string;
  scheduledAt: string | Date;
  consentConfirmed: boolean;
}) {
  const admin = await requireWhatsAppPlatformAdmin();
  if (input.consentConfirmed !== true) {
    throw new Error("Confirm that campaign recipients have opted in to receive WhatsApp messages.");
  }
  const campaignId = input.campaignId.trim();
  const templateId = input.templateId.trim();
  if (!campaignId || campaignId.length > 255) throw new Error("Select a valid campaign.");
  if (!templateId || templateId.length > 255) throw new Error("Select a valid WhatsApp template.");
  const scheduledAt = normalizeScheduledAt(
    input.scheduledAt instanceof Date ? input.scheduledAt.toISOString() : input.scheduledAt,
  );

  const [configuration, campaign, template] = await Promise.all([
    prisma.platformWhatsAppConfiguration.findUnique({
      where: { id: CONFIGURATION_ID },
      select: { api_key_encrypted: true },
    }),
    prisma.platformCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        leads: {
          select: {
            lead: { select: { id: true, name: true, mobile: true } },
          },
        },
      },
    }),
    prisma.platformWhatsAppTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, is_active: true },
    }),
  ]);
  if (!configuration?.api_key_encrypted) throw new Error("Configure the MSG91 API key in WhatsApp API settings first.");
  if (!campaign) throw new Error("Campaign not found.");
  if (!template?.is_active) throw new Error("Select an active WhatsApp template.");
  if (campaign.leads.length === 0) throw new Error("Add leads to this campaign before scheduling a WhatsApp message.");
  if (campaign.leads.length > CAMPAIGN_MESSAGE_LIMIT) {
    throw new Error(`Send WhatsApp campaigns to no more than ${CAMPAIGN_MESSAGE_LIMIT} leads at a time.`);
  }

  return prisma.$transaction(async (transaction) => {
    const message = await transaction.platformWhatsAppCampaignMessage.create({
      data: {
        campaign_id: campaignId,
        template_id: templateId,
        scheduled_at: scheduledAt,
        created_by_admin_id: admin.id,
        status: "SCHEDULED",
        recipients: {
          create: campaign.leads.map(({ lead }) => {
            const phone = normalizeMobile(lead.mobile);
            return {
              lead_id: lead.id,
              customer_name: lead.name,
              phone_number: phone ?? lead.mobile?.slice(0, 20) ?? "",
              status: phone ? "PENDING" : "FAILED",
              failure_summary: phone ? null : "Lead has no valid WhatsApp mobile number.",
            };
          }),
        },
      },
      select: { id: true, scheduled_at: true, status: true },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_WHATSAPP_CAMPAIGN_SCHEDULED",
        entity_type: "PlatformWhatsAppCampaignMessage",
        entity_id: message.id,
        details: {
          campaignId,
          templateId,
          scheduledAt: scheduledAt.toISOString(),
          recipientCount: campaign.leads.length,
          optInConfirmed: true,
        },
      },
    });
    return message;
  });
}

export async function listPlatformWhatsAppCampaignMessages(campaignId: string) {
  await requireWhatsAppPlatformAdmin();
  const id = campaignId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid campaign.");
  return prisma.platformWhatsAppCampaignMessage.findMany({
    where: { campaign_id: id },
    orderBy: [{ scheduled_at: "desc" }, { created_at: "desc" }],
    take: 50,
    select: {
      id: true,
      scheduled_at: true,
      status: true,
      submitted_at: true,
      failure_summary: true,
      template: { select: { template_name: true } },
      recipients: {
        select: {
          customer_name: true,
          phone_number: true,
          status: true,
          failure_summary: true,
          delivered_at: true,
        },
      },
    },
  });
}

function normalizeCampaignMessageIdentifiers(campaignId: string, messageId: string) {
  const normalizedCampaignId = campaignId.trim();
  const normalizedMessageId = messageId.trim();
  if (!normalizedCampaignId || normalizedCampaignId.length > 255) {
    throw new Error("Select a valid campaign.");
  }
  if (!normalizedMessageId || normalizedMessageId.length > 255) {
    throw new Error("Select a valid WhatsApp schedule.");
  }
  return { campaignId: normalizedCampaignId, messageId: normalizedMessageId };
}

function assertCampaignMessageHasNoDelivery(message: {
  status: string;
  recipients: Array<{ status: string }>;
}) {
  if (message.recipients.some(({ status }) => status === "DELIVERED" || status === "READ")) {
    throw new Error("A WhatsApp schedule cannot be changed after a recipient has received the message.");
  }
  if (
    ["PROCESSING", "SUBMITTED", "UNKNOWN"].includes(message.status) ||
    message.recipients.some(({ status }) => status === "SUBMITTED")
  ) {
    throw new Error("A WhatsApp schedule cannot be changed while it is processing or awaiting delivery status.");
  }
}

export async function cancelPlatformWhatsAppCampaignMessage(campaignId: string, messageId: string) {
  const admin = await requireWhatsAppPlatformAdmin();
  const ids = normalizeCampaignMessageIdentifiers(campaignId, messageId);

  return prisma.$transaction(async (transaction) => {
    const message = await transaction.platformWhatsAppCampaignMessage.findFirst({
      where: { id: ids.messageId, campaign_id: ids.campaignId },
      select: {
        id: true,
        status: true,
        recipients: { select: { status: true } },
      },
    });
    if (!message) throw new Error("WhatsApp schedule not found.");
    assertCampaignMessageHasNoDelivery(message);
    if (message.status !== "SCHEDULED") {
      throw new Error("Only a scheduled WhatsApp message can be cancelled.");
    }

    const updated = await transaction.platformWhatsAppCampaignMessage.updateMany({
      where: { id: ids.messageId, campaign_id: ids.campaignId, status: "SCHEDULED" },
      data: {
        status: "CANCELLED",
        failure_summary: "Cancelled by platform administrator.",
      },
    });
    if (updated.count !== 1) {
      throw new Error("The WhatsApp schedule changed before it could be cancelled. Refresh and try again.");
    }
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_WHATSAPP_CAMPAIGN_MESSAGE_CANCELLED",
        entity_type: "PlatformWhatsAppCampaignMessage",
        entity_id: ids.messageId,
        details: { campaignId: ids.campaignId },
      },
    });
    return { cancelled: true };
  });
}

export async function deletePlatformWhatsAppCampaignMessage(campaignId: string, messageId: string) {
  const admin = await requireWhatsAppPlatformAdmin();
  const ids = normalizeCampaignMessageIdentifiers(campaignId, messageId);

  return prisma.$transaction(async (transaction) => {
    const message = await transaction.platformWhatsAppCampaignMessage.findFirst({
      where: { id: ids.messageId, campaign_id: ids.campaignId },
      select: {
        id: true,
        status: true,
        template_id: true,
        recipients: { select: { status: true } },
      },
    });
    if (!message) throw new Error("WhatsApp schedule not found.");
    assertCampaignMessageHasNoDelivery(message);
    if (!["SCHEDULED", "CANCELLED", "FAILED"].includes(message.status)) {
      throw new Error("Only unsent, cancelled, or failed WhatsApp schedules can be deleted.");
    }

    if (message.status === "SCHEDULED") {
      const cancelled = await transaction.platformWhatsAppCampaignMessage.updateMany({
        where: { id: ids.messageId, campaign_id: ids.campaignId, status: "SCHEDULED" },
        data: {
          status: "CANCELLED",
          failure_summary: "Cancelled because the schedule was deleted.",
        },
      });
      if (cancelled.count !== 1) {
        throw new Error("The WhatsApp schedule changed before it could be deleted. Refresh and try again.");
      }
    }

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_WHATSAPP_CAMPAIGN_MESSAGE_DELETED",
        entity_type: "PlatformWhatsAppCampaignMessage",
        entity_id: ids.messageId,
        details: {
          campaignId: ids.campaignId,
          previousStatus: message.status,
          templateId: message.template_id,
        },
      },
    });
    await transaction.platformWhatsAppCampaignMessage.delete({
      where: { id: ids.messageId },
    });
    return { deleted: true };
  });
}

export async function processDuePlatformWhatsAppCampaignMessages() {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  await prisma.platformWhatsAppCampaignMessage.updateMany({
    where: { status: "PROCESSING", updated_at: { lt: staleBefore } },
    data: {
      status: "UNKNOWN",
      failure_summary: "Delivery submission could not be confirmed; check MSG91 before retrying.",
    },
  });

  const dueMessages = await prisma.platformWhatsAppCampaignMessage.findMany({
    where: { status: "SCHEDULED", scheduled_at: { lte: new Date() } },
    orderBy: { scheduled_at: "asc" },
    take: 10,
    select: { id: true },
  });
  let processedCount = 0;

  for (const { id } of dueMessages) {
    const claimed = await prisma.platformWhatsAppCampaignMessage.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) continue;

    try {
      const [configuration, message] = await Promise.all([
        prisma.platformWhatsAppConfiguration.findUnique({
          where: { id: CONFIGURATION_ID },
        }),
        prisma.platformWhatsAppCampaignMessage.findUnique({
          where: { id },
          include: {
            template: true,
            recipients: { where: { status: "PENDING" } },
          },
        }),
      ]);
      if (!configuration?.api_key_encrypted || !message) {
        await prisma.platformWhatsAppCampaignMessage.update({
          where: { id },
          data: { status: "FAILED", failure_summary: "MSG91 configuration or campaign message is unavailable." },
        });
        processedCount += 1;
        continue;
      }
      if (message.recipients.length === 0) {
        await prisma.platformWhatsAppCampaignMessage.update({
          where: { id },
          data: { status: "FAILED", failure_summary: "There are no recipients with valid mobile numbers." },
        });
        processedCount += 1;
        continue;
      }

      const payload = {
        integrated_number: message.template.integrated_number,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: message.template.template_name,
            namespace: configuration.namespace,
            language: { code: message.template.language_code, policy: "deterministic" },
            to_and_components: message.recipients.map((recipient) => ({
              to: [recipient.phone_number],
              components: message.template.image_url
                ? {
                    header_1: {
                      type: "image",
                      value: message.template.image_url,
                    },
                  }
                : {},
            })),
          },
        },
      };

      let response: Response;
      try {
        response = await fetch(MSG91_TEMPLATE_ENDPOINT, {
          method: "POST",
          headers: {
            authkey: decryptSecret(configuration.api_key_encrypted),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        await prisma.platformWhatsAppCampaignMessage.update({
          where: { id },
          data: {
            status: "UNKNOWN",
            failure_summary: "MSG91 submission response was not received; check MSG91 before retrying.",
          },
        });
        processedCount += 1;
        continue;
      }

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = null;
      }
      const isAccepted =
        response.ok &&
        typeof responseBody === "object" &&
        responseBody !== null &&
        "status" in responseBody &&
        responseBody.status === "success";
      if (!isAccepted) {
        const failureSummary = "MSG91 did not accept the campaign message.";
        await prisma.$transaction([
          prisma.platformWhatsAppCampaignMessage.update({
            where: { id },
            data: { status: "FAILED", failure_summary: failureSummary },
          }),
          prisma.platformWhatsAppCampaignMessageRecipient.updateMany({
            where: { campaign_message_id: id, status: "PENDING" },
            data: { status: "FAILED", failure_summary: failureSummary },
          }),
        ]);
        processedCount += 1;
        continue;
      }

      const providerRequestId = readProviderRequestId(responseBody);
      await prisma.$transaction([
        prisma.platformWhatsAppCampaignMessage.update({
          where: { id },
          data: {
            status: "SUBMITTED",
            provider_request_id: providerRequestId,
            submitted_at: new Date(),
            failure_summary: null,
          },
        }),
        prisma.platformWhatsAppCampaignMessageRecipient.updateMany({
          where: { campaign_message_id: id, status: "PENDING" },
          data: {
            status: "SUBMITTED",
            provider_message_id: providerRequestId,
            failure_summary: null,
          },
        }),
        prisma.platformAuditEvent.create({
          data: {
            platform_admin_id: message.created_by_admin_id,
            action: "PLATFORM_WHATSAPP_CAMPAIGN_SUBMITTED",
            entity_type: "PlatformWhatsAppCampaignMessage",
            entity_id: id,
            details: {
              campaignId: message.campaign_id,
              templateId: message.template_id,
              recipientCount: message.recipients.length,
              providerRequestId,
            },
          },
        }),
      ]);
      processedCount += 1;
    } catch {
      await prisma.platformWhatsAppCampaignMessage.update({
        where: { id },
        data: {
          status: "UNKNOWN",
          failure_summary: "Campaign submission could not be confirmed; check MSG91 before retrying.",
        },
      });
      processedCount += 1;
    }
  }

  return { dispatched: processedCount };
}

function normalizeDeliveryStatus(value: string) {
  const status = value.trim().toLowerCase();
  if (["sent", "accepted"].includes(status)) return "SUBMITTED";
  if (["delivered", "delivery_success"].includes(status)) return "DELIVERED";
  if (["read", "seen"].includes(status)) return "READ";
  if (["failed", "undelivered", "rejected", "delivery_failed"].includes(status)) return "FAILED";
  return null;
}

export async function applyPlatformWhatsAppDeliveryCallback(
  token: string,
  input: { requestId: string; mobile?: string; status: string },
) {
  if (!token || token.length > 128) return false;
  const configuration = await prisma.platformWhatsAppConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
    select: { callback_token_hash: true },
  });
  if (!configuration?.callback_token_hash) return false;
  const presentedHash = createHash("sha256").update(token).digest();
  const storedHash = Buffer.from(configuration.callback_token_hash, "hex");
  if (storedHash.length !== presentedHash.length || !timingSafeEqual(storedHash, presentedHash)) {
    return false;
  }

  const requestId = input.requestId.trim();
  const status = normalizeDeliveryStatus(input.status);
  const mobile = input.mobile ? normalizeMobile(input.mobile) : null;
  if (!requestId || requestId.length > 255 || !status || (input.mobile && !mobile)) {
    return false;
  }

  const where = {
    provider_message_id: requestId,
    status: status === "READ"
      ? { in: ["SUBMITTED", "DELIVERED", "READ"] }
      : status === "DELIVERED"
        ? { in: ["SUBMITTED", "DELIVERED"] }
        : { in: ["SUBMITTED"] },
    ...(mobile ? { phone_number: mobile } : {}),
  };
  const recipients = await prisma.platformWhatsAppCampaignMessageRecipient.findMany({
    where,
    select: { id: true, campaign_message_id: true },
  });
  if (recipients.length === 0) return false;

  await prisma.$transaction([
    prisma.platformWhatsAppCampaignMessageRecipient.updateMany({
      where: { id: { in: recipients.map(({ id }) => id) } },
      data: {
        status,
        delivered_at: status === "DELIVERED" ? new Date() : undefined,
        failure_summary: status === "FAILED" ? "MSG91 reported delivery failure." : null,
      },
    }),
    prisma.platformAuditEvent.createMany({
      data: [...new Set(recipients.map(({ campaign_message_id }) => campaign_message_id))].map((id) => ({
        action: "PLATFORM_WHATSAPP_DELIVERY_STATUS_UPDATED",
        entity_type: "PlatformWhatsAppCampaignMessage",
        entity_id: id,
        details: { status, recipientCount: recipients.length },
      })),
    }),
  ]);
  return true;
}

export async function recordPlatformWhatsAppDeliveryCallback(input: {
  callbackToken: string;
  requestId: string;
  mobile: string;
  status: string;
}) {
  const updated = await applyPlatformWhatsAppDeliveryCallback(input.callbackToken, {
    requestId: input.requestId,
    mobile: input.mobile,
    status: input.status,
  });
  if (!updated) throw new Error("Delivery callback could not be authenticated or matched.");
  return { updated };
}

export async function dispatchDuePlatformWhatsAppCampaignMessages() {
  return processDuePlatformWhatsAppCampaignMessages();
}

export async function rotatePlatformWhatsAppDeliveryToken() {
  const admin = await requireWhatsAppPlatformAdmin();
  const token = randomBytes(32).toString("base64url");
  const callbackTokenHash = createHash("sha256").update(token).digest("hex");

  await prisma.$transaction(async (transaction) => {
    await transaction.platformWhatsAppConfiguration.upsert({
      where: { id: CONFIGURATION_ID },
      create: {
        id: CONFIGURATION_ID,
        namespace: DEFAULT_NAMESPACE,
        callback_token_hash: callbackTokenHash,
      },
      update: { callback_token_hash: callbackTokenHash },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_WHATSAPP_DELIVERY_TOKEN_ROTATED",
        entity_type: "PlatformWhatsAppConfiguration",
        entity_id: CONFIGURATION_ID,
      },
    });
  });
  return { token };
}
