import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { encryptSecret } from "@/lib/auth/secret-cryptography";
import { prisma } from "@/lib/database/prisma-client";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

const CONFIGURATION_MODULE = [
  "whatsapp-integration-configuration",
  "WhatsApp Integration Configuration",
] as const;
const TEMPLATES_MODULE = [
  "whatsapp-integration-templates",
  "WhatsApp Integration Templates",
] as const;
const TEMPLATE_LIMIT = 200;

export type OrganizationWhatsAppTemplateInput = {
  templateName: string;
  sampleTemplateText: string;
  integratedNumber: string;
  imageUrl: string;
  languageCode: string;
  isActive: boolean;
};

export type OrganizationWhatsAppTemplate = OrganizationWhatsAppTemplateInput & {
  id: string;
};

export type OrganizationWhatsAppSettings = {
  hasApiKey: boolean;
  namespace: string;
  isActive: boolean;
};

function metadataObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function configurationRecordId(organizationId: string) {
  const digest = createHash("sha256")
    .update(`${organizationId}\0whatsapp-configuration`)
    .digest("hex");
  return `whatsapp-config-${digest}`;
}

async function authorize(workspaceUserId: string, publicOrganizationId: string) {
  const organization = await getOrganizationForUser(workspaceUserId, publicOrganizationId);
  if (!organization) {
    throw new Error("Access denied: You are not a member of this organization.");
  }
  await requireOrganizationPermission(
    workspaceUserId,
    organization.id,
    "MANAGE_MASTER_DATA",
  );
  return organization;
}

export function normalizeOrganizationWhatsAppSettings(input: {
  apiKey: string;
  namespace: string;
  isActive: boolean;
}) {
  const apiKey = input.apiKey.trim();
  const namespace = input.namespace.trim();
  if (apiKey.length > 2500) {
    throw new Error("MSG91 API key must be 2500 characters or fewer.");
  }
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(namespace)) {
    throw new Error("Enter a valid MSG91 template namespace.");
  }
  return { apiKey, namespace, isActive: input.isActive === true };
}

export function normalizeOrganizationWhatsAppTemplate(
  input: OrganizationWhatsAppTemplateInput,
) {
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
    templateName,
    sampleTemplateText,
    integratedNumber,
    imageUrl,
    languageCode,
    isActive: input.isActive === true,
  };
}

async function ensureModule(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  [moduleKey, moduleName]: readonly [string, string],
) {
  return transaction.masterModule.upsert({
    where: {
      organization_id_module_key: {
        organization_id: organizationId,
        module_key: moduleKey,
      },
    },
    create: {
      organization_id: organizationId,
      module_key: moduleKey,
      module_name: moduleName,
      status: "active",
    },
    update: { status: "active", module_name: moduleName },
    select: { id: true },
  });
}

export async function getOrganizationWhatsAppIntegration(
  workspaceUserId: string,
  publicOrganizationId: string,
) {
  const organization = await authorize(workspaceUserId, publicOrganizationId);
  const modules = await prisma.masterModule.findMany({
    where: {
      organization_id: organization.id,
      module_key: { in: [CONFIGURATION_MODULE[0], TEMPLATES_MODULE[0]] },
    },
    select: { id: true, module_key: true },
  });
  const configurationModule = modules.find(({ module_key }) => module_key === CONFIGURATION_MODULE[0]);
  const templatesModule = modules.find(({ module_key }) => module_key === TEMPLATES_MODULE[0]);

  const [configuration, templateRows] = await Promise.all([
    configurationModule
      ? prisma.masterModuleValue.findFirst({
          where: {
            id: configurationRecordId(organization.id),
            module_id: configurationModule.id,
            module: { organization_id: organization.id },
          },
          select: { metadata: true, is_active: true },
        })
      : null,
    templatesModule
      ? prisma.masterModuleValue.findMany({
          where: {
            module_id: templatesModule.id,
            module: { organization_id: organization.id },
          },
          orderBy: [{ created_at: "desc" }, { id: "asc" }],
          take: TEMPLATE_LIMIT,
          select: { id: true, label: true, is_active: true, metadata: true },
        })
      : [],
  ]);
  const configData = metadataObject(configuration?.metadata ?? null);
  const templates = templateRows.flatMap((row) => {
    const data = metadataObject(row.metadata);
    if (data.kind !== "template") return [];
    return [{
      id: row.id,
      templateName: row.label,
      sampleTemplateText: stringValue(data.sampleTemplateText),
      integratedNumber: stringValue(data.integratedNumber),
      imageUrl: stringValue(data.imageUrl),
      languageCode: stringValue(data.languageCode),
      isActive: row.is_active,
    }];
  });

  return {
    settings: {
      hasApiKey: Boolean(stringValue(configData.apiKeyEncrypted)),
      namespace: stringValue(configData.namespace),
      isActive: Boolean(configuration?.is_active && configData.isActive === true),
    } satisfies OrganizationWhatsAppSettings,
    templates,
  };
}

export async function saveOrganizationWhatsAppSettings(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  apiKey: string;
  namespace: string;
  isActive: boolean;
}) {
  const organization = await authorize(input.workspaceUserId, input.publicOrganizationId);
  const normalized = normalizeOrganizationWhatsAppSettings(input);
  let hasApiKey = false;
  await prisma.$transaction(async (transaction) => {
    const configurationModule = await ensureModule(
      transaction,
      organization.id,
      CONFIGURATION_MODULE,
    );
    const id = configurationRecordId(organization.id);
    const existing = await transaction.masterModuleValue.findFirst({
      where: {
        id,
        module_id: configurationModule.id,
        module: { organization_id: organization.id },
      },
      select: { metadata: true },
    });
    const existingData = metadataObject(existing?.metadata ?? null);
    const apiKeyEncrypted = normalized.apiKey
      ? encryptSecret(normalized.apiKey)
      : stringValue(existingData.apiKeyEncrypted);
    if (normalized.isActive && !apiKeyEncrypted) {
      throw new Error("Enter an MSG91 API key before enabling the integration.");
    }
    hasApiKey = Boolean(apiKeyEncrypted);

    const data = {
      label: "MSG91 WhatsApp Configuration",
      is_active: normalized.isActive,
      metadata: {
        kind: "configuration",
        apiKeyEncrypted,
        namespace: normalized.namespace,
        isActive: normalized.isActive,
      },
    };
    if (existing) {
      const updated = await transaction.masterModuleValue.updateMany({
        where: {
          id,
          module_id: configurationModule.id,
          module: { organization_id: organization.id },
        },
        data,
      });
      if (updated.count !== 1) {
        throw new Error("The organization MSG91 configuration could not be updated.");
      }
    } else {
      await transaction.masterModuleValue.create({
        data: {
          id,
          module_id: configurationModule.id,
          ...data,
        },
      });
    }
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: input.workspaceUserId,
        module: "INTEGRATIONS",
        action: existing ? "UPDATE" : "CREATE",
        entity_type: "ORG_WHATSAPP_CONFIGURATION",
        entity_id: id,
        details: {
          apiKeyUpdated: Boolean(normalized.apiKey),
          namespace: normalized.namespace,
          isActive: normalized.isActive,
        },
      },
    });
  });
  return {
    hasApiKey,
    namespace: normalized.namespace,
    isActive: normalized.isActive,
  } satisfies OrganizationWhatsAppSettings;
}

export async function saveOrganizationWhatsAppTemplate(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  templateId?: string;
  template: OrganizationWhatsAppTemplateInput;
}) {
  const organization = await authorize(input.workspaceUserId, input.publicOrganizationId);
  const template = normalizeOrganizationWhatsAppTemplate(input.template);

  return prisma.$transaction(async (transaction) => {
    const templatesModule = await ensureModule(
      transaction,
      organization.id,
      TEMPLATES_MODULE,
    );
    const existing = input.templateId
      ? await transaction.masterModuleValue.findFirst({
          where: {
            id: input.templateId,
            module_id: templatesModule.id,
            module: { organization_id: organization.id },
          },
          select: { id: true, metadata: true },
        })
      : null;
    if (input.templateId && (!existing || metadataObject(existing.metadata).kind !== "template")) {
      throw new Error("The selected WhatsApp template was not found.");
    }
    const duplicates = await transaction.masterModuleValue.findMany({
      where: {
        module_id: templatesModule.id,
        module: { organization_id: organization.id },
      },
      select: { id: true, label: true, metadata: true },
      take: TEMPLATE_LIMIT + 1,
    });
    if (!existing && duplicates.length >= TEMPLATE_LIMIT) {
      throw new Error(`An organization can have no more than ${TEMPLATE_LIMIT} WhatsApp templates.`);
    }
    if (duplicates.some((row) =>
      row.id !== existing?.id
      && metadataObject(row.metadata).kind === "template"
      && row.label.toLowerCase() === template.templateName.toLowerCase()
      && stringValue(metadataObject(row.metadata).languageCode).toLowerCase()
        === template.languageCode.toLowerCase(),
    )) {
      throw new Error("A template with this name and language already exists for this organization.");
    }

    const id = existing?.id ?? `whatsapp-template-${randomUUID()}`;
    const data = {
      label: template.templateName,
      is_active: template.isActive,
      metadata: {
        kind: "template",
        sampleTemplateText: template.sampleTemplateText,
        integratedNumber: template.integratedNumber,
        imageUrl: template.imageUrl,
        languageCode: template.languageCode,
      },
    };
    if (existing) {
      const updated = await transaction.masterModuleValue.updateMany({
        where: {
          id: existing.id,
          module_id: templatesModule.id,
          module: { organization_id: organization.id },
        },
        data,
      });
      if (updated.count !== 1) {
        throw new Error("The organization WhatsApp template could not be updated.");
      }
    } else {
      await transaction.masterModuleValue.create({
        data: {
          id,
          module_id: templatesModule.id,
          ...data,
        },
      });
    }
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: input.workspaceUserId,
        module: "INTEGRATIONS",
        action: existing ? "UPDATE" : "CREATE",
        entity_type: "ORG_WHATSAPP_TEMPLATE",
        entity_id: id,
        details: {
          templateName: template.templateName,
          languageCode: template.languageCode,
          isActive: template.isActive,
        },
      },
    });
    return { id, ...template };
  });
}

export async function setOrganizationWhatsAppTemplateActive(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  templateId: string;
  isActive: boolean;
}) {
  const organization = await authorize(input.workspaceUserId, input.publicOrganizationId);
  return prisma.$transaction(async (transaction) => {
    const templatesModule = await transaction.masterModule.findFirst({
      where: {
        organization_id: organization.id,
        module_key: TEMPLATES_MODULE[0],
      },
      select: { id: true },
    });
    const existing = templatesModule
      ? await transaction.masterModuleValue.findFirst({
          where: {
            id: input.templateId,
            module_id: templatesModule.id,
            module: { organization_id: organization.id },
          },
          select: { id: true, label: true, metadata: true },
        })
      : null;
    if (!templatesModule || !existing || metadataObject(existing.metadata).kind !== "template") {
      throw new Error("The selected WhatsApp template was not found.");
    }
    const updated = await transaction.masterModuleValue.updateMany({
      where: {
        id: existing.id,
        module_id: templatesModule.id,
        module: { organization_id: organization.id },
      },
      data: { is_active: input.isActive },
    });
    if (updated.count !== 1) {
      throw new Error("The organization WhatsApp template could not be updated.");
    }
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: input.workspaceUserId,
        module: "INTEGRATIONS",
        action: "UPDATE",
        entity_type: "ORG_WHATSAPP_TEMPLATE",
        entity_id: existing.id,
        details: { templateName: existing.label, isActive: input.isActive },
      },
    });
    return { id: existing.id, isActive: input.isActive };
  });
}
