import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

const MAX_CAMPAIGN_LEADS = 500;

function normalizeCampaignName(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 255) {
    throw new Error("Enter a campaign name between 2 and 255 characters.");
  }
  return name;
}

function normalizeCampaignDate(value: string) {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Enter a valid campaign date.");
  }
  const campaignDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(campaignDate.getTime()) || campaignDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a valid campaign date.");
  }
  return campaignDate;
}

function normalizeLeadIds(values: string[]) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Select at least one lead.");
  }
  if (values.length > MAX_CAMPAIGN_LEADS) {
    throw new Error(`Add up to ${MAX_CAMPAIGN_LEADS} leads to a campaign at a time.`);
  }

  const leadIds = [...new Set(values.map((value) => value.trim()))];
  if (leadIds.some((id) => !id || id.length > 255)) {
    throw new Error("Select valid leads.");
  }
  return leadIds;
}

function getCampaignActionEligibility(messages: Array<{
  status: string;
  recipients: Array<{ status: string }>;
}>) {
  const hasDeliveredRecipient = messages.some(({ recipients }) =>
    recipients.some(({ status }) => status === "DELIVERED" || status === "READ"),
  );
  const hasInFlightMessage = messages.some(({ status }) =>
    status === "PROCESSING" || status === "SUBMITTED" || status === "UNKNOWN",
  );
  const scheduledCount = messages.filter(({ status }) => status === "SCHEDULED").length;
  const actionBlockReason = hasDeliveredRecipient
    ? "Campaign actions are unavailable after a message has been delivered."
    : hasInFlightMessage
      ? "Campaign actions are unavailable while a message is processing or awaiting delivery status."
      : null;

  return {
    can_cancel: !actionBlockReason && scheduledCount > 0,
    can_delete: !actionBlockReason,
    action_block_reason: actionBlockReason ?? (scheduledCount === 0 ? "There are no scheduled messages to cancel." : null),
  };
}

export async function listPlatformCampaigns() {
  await requirePlatformSessionAdmin();
  const campaigns = await prisma.platformCampaign.findMany({
    orderBy: [{ campaign_date: "desc" }, { created_at: "desc" }],
    select: {
      id: true,
      name: true,
      campaign_date: true,
      created_at: true,
      _count: { select: { leads: true } },
      whatsappMessages: {
        select: {
          status: true,
          recipients: { select: { status: true } },
        },
      },
    },
  });
  return campaigns.map(({ whatsappMessages, ...campaign }) => ({
    ...campaign,
    ...getCampaignActionEligibility(whatsappMessages),
  }));
}

export async function getPlatformCampaign(campaignId: string) {
  await requirePlatformSessionAdmin();
  const id = campaignId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid campaign.");

  const campaign = await prisma.platformCampaign.findUnique({
    where: { id },
    include: {
      leads: {
        orderBy: { added_at: "desc" },
        select: {
          added_at: true,
          lead: {
            select: {
              id: true,
              name: true,
              mobile: true,
              company_name: true,
              city: true,
              stage: true,
            },
          },
        },
      },
    },
  });
  if (!campaign) throw new Error("Campaign not found.");
  return campaign;
}

export async function createPlatformCampaign(input: { name: string; campaignDate: string }) {
  const admin = await requirePlatformSessionAdmin();
  const name = normalizeCampaignName(input.name);
  const campaignDate = normalizeCampaignDate(input.campaignDate);

  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.platformCampaign.create({
      data: { name, campaign_date: campaignDate },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_CAMPAIGN_CREATED",
        entity_type: "PlatformCampaign",
        entity_id: campaign.id,
        details: { name, campaignDate: campaignDate.toISOString().slice(0, 10) },
      },
    });
    return campaign;
  });
}

export async function addPlatformLeadsToCampaign(campaignId: string, values: string[]) {
  const admin = await requirePlatformSessionAdmin();
  const id = campaignId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid campaign.");
  const leadIds = normalizeLeadIds(values);

  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.platformCampaign.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!campaign) throw new Error("Campaign not found.");

    const leads = await transaction.platformLead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true },
    });
    if (leads.length !== leadIds.length) {
      throw new Error("One or more selected leads could not be found.");
    }

    const existingEntries = await transaction.platformCampaignLead.findMany({
      where: { campaign_id: id, lead_id: { in: leadIds } },
      select: { lead_id: true },
    });
    const existingLeadIds = new Set(existingEntries.map(({ lead_id }) => lead_id));
    const newLeadIds = leadIds.filter((leadId) => !existingLeadIds.has(leadId));

    if (newLeadIds.length > 0) {
      await transaction.platformCampaignLead.createMany({
        data: newLeadIds.map((lead_id) => ({ campaign_id: id, lead_id })),
      });
      await transaction.platformAuditEvent.createMany({
        data: newLeadIds.map((leadId) => ({
          platform_admin_id: admin.id,
          action: "PLATFORM_CAMPAIGN_LEAD_ADDED",
          entity_type: "PlatformCampaignLead",
          entity_id: id,
          details: { campaignId: id, leadId },
        })),
      });
    }

    return {
      addedCount: newLeadIds.length,
      alreadyAddedCount: leadIds.length - newLeadIds.length,
    };
  });
}

export async function removePlatformLeadFromCampaign(campaignId: string, leadId: string) {
  const admin = await requirePlatformSessionAdmin();
  const normalizedCampaignId = campaignId.trim();
  const normalizedLeadId = leadId.trim();
  if (!normalizedCampaignId || normalizedCampaignId.length > 255) {
    throw new Error("Select a valid campaign.");
  }
  if (!normalizedLeadId || normalizedLeadId.length > 255) {
    throw new Error("Select a valid lead.");
  }

  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.platformCampaignLead.findUnique({
      where: {
        campaign_id_lead_id: {
          campaign_id: normalizedCampaignId,
          lead_id: normalizedLeadId,
        },
      },
      select: {
        campaign_id: true,
        lead_id: true,
      },
    });
    if (!membership) throw new Error("Lead is not assigned to this campaign.");

    await transaction.platformCampaignLead.delete({
      where: {
        campaign_id_lead_id: {
          campaign_id: normalizedCampaignId,
          lead_id: normalizedLeadId,
        },
      },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_CAMPAIGN_LEAD_REMOVED",
        entity_type: "PlatformCampaignLead",
        entity_id: normalizedCampaignId,
        details: {
          campaignId: normalizedCampaignId,
          leadId: normalizedLeadId,
        },
      },
    });

    return { removed: true };
  });
}

function normalizeCampaignId(campaignId: string) {
  const id = campaignId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid campaign.");
  return id;
}

function assertCampaignHasNoDeliveredOrInFlightMessages(messages: Array<{
  status: string;
  recipients: Array<{ status: string }>;
}>) {
  const eligibility = getCampaignActionEligibility(messages);
  if (eligibility.action_block_reason && eligibility.action_block_reason !== "There are no scheduled messages to cancel.") {
    throw new Error(eligibility.action_block_reason);
  }
}

export async function cancelScheduledPlatformCampaignMessages(campaignId: string) {
  const admin = await requirePlatformSessionAdmin();
  const id = normalizeCampaignId(campaignId);

  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.platformCampaign.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!campaign) throw new Error("Campaign not found.");

    const scheduled = await transaction.platformWhatsAppCampaignMessage.updateMany({
      where: { campaign_id: id, status: "SCHEDULED" },
      data: {
        status: "CANCELLED",
        failure_summary: "Cancelled by platform administrator.",
      },
    });
    const messages = await transaction.platformWhatsAppCampaignMessage.findMany({
      where: { campaign_id: id },
      select: {
        status: true,
        recipients: { select: { status: true } },
      },
    });
    assertCampaignHasNoDeliveredOrInFlightMessages(messages);
    if (scheduled.count === 0) throw new Error("There are no scheduled messages to cancel.");

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_CAMPAIGN_SCHEDULED_MESSAGES_CANCELLED",
        entity_type: "PlatformCampaign",
        entity_id: id,
        details: { campaignId: id, cancelledMessageCount: scheduled.count },
      },
    });
    return { cancelledCount: scheduled.count };
  });
}

export async function deletePlatformCampaign(campaignId: string) {
  const admin = await requirePlatformSessionAdmin();
  const id = normalizeCampaignId(campaignId);

  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.platformCampaign.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!campaign) throw new Error("Campaign not found.");

    await transaction.platformWhatsAppCampaignMessage.updateMany({
      where: { campaign_id: id, status: "SCHEDULED" },
      data: {
        status: "CANCELLED",
        failure_summary: "Cancelled because the campaign was deleted.",
      },
    });
    const messages = await transaction.platformWhatsAppCampaignMessage.findMany({
      where: { campaign_id: id },
      select: {
        status: true,
        recipients: { select: { status: true } },
      },
    });
    assertCampaignHasNoDeliveredOrInFlightMessages(messages);

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_CAMPAIGN_DELETED",
        entity_type: "PlatformCampaign",
        entity_id: id,
        details: { campaignId: id, name: campaign.name },
      },
    });
    await transaction.platformCampaign.delete({ where: { id } });
    return { deleted: true };
  });
}
