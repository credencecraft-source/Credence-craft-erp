import { Prisma, type OrganizationPrintDocumentType } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  parseOrganizationPrintTemplateInput,
  parseOrganizationPrintTemplateDesign,
  type OrganizationPrintTemplateInput,
} from "./organization-print-template-contract";

const printTemplateSelect = {
  id: true,
  document_type: true,
  name: true,
  is_active: true,
  is_default: true,
  design_config: true,
  created_at: true,
  updated_at: true,
} as const;

function mapPrintTemplate(template: {
  id: string;
  document_type: OrganizationPrintDocumentType;
  name: string;
  is_active: boolean;
  is_default: boolean;
  design_config: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: template.id,
    documentType: template.document_type,
    name: template.name,
    isActive: template.is_active,
    isDefault: template.is_default,
    designConfig: parseOrganizationPrintTemplateDesign(template.design_config),
    createdAt: template.created_at.toISOString(),
    updatedAt: template.updated_at.toISOString(),
  };
}

async function writeAuditEvent(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  action: string,
  template: { id: string; document_type: OrganizationPrintDocumentType; name: string },
  details: Prisma.InputJsonObject,
) {
  await transaction.auditEvent.create({
    data: {
      organization_id: organizationId,
      user_id: userId,
      module: "challan-print-out",
      action,
      entity_type: "OrganizationPrintTemplate",
      entity_id: template.id,
      details: {
        documentType: template.document_type,
        templateName: template.name,
        ...details,
      },
    },
  });
}

export async function listOrganizationPrintTemplates(
  userId: string,
  publicOrganizationId: string,
  documentType?: OrganizationPrintDocumentType,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "ORGANIZATION_SETTINGS",
  );
  const templates = await prisma.organizationPrintTemplate.findMany({
    where: {
      organization_id: membership.organization_id,
      ...(documentType ? { document_type: documentType } : {}),
    },
    orderBy: [{ document_type: "asc" }, { updated_at: "desc" }, { name: "asc" }],
    take: 100,
    select: printTemplateSelect,
  });
  return templates.map(mapPrintTemplate);
}

export async function getDefaultOrganizationPrintTemplate(
  userId: string,
  publicOrganizationId: string,
  documentType: OrganizationPrintDocumentType,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "VIEW_REPORTS",
  );
  const template = await prisma.organizationPrintTemplate.findFirst({
    where: {
      organization_id: membership.organization_id,
      document_type: documentType,
      is_active: true,
      is_default: true,
    },
    select: printTemplateSelect,
  });
  return template ? mapPrintTemplate(template) : null;
}

export async function getOrganizationPrintTemplate(
  userId: string,
  publicOrganizationId: string,
  templateId: string,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "ORGANIZATION_SETTINGS",
  );
  const template = await prisma.organizationPrintTemplate.findFirst({
    where: { organization_id: membership.organization_id, id: templateId },
    select: printTemplateSelect,
  });
  return template ? mapPrintTemplate(template) : null;
}

export async function createOrganizationPrintTemplate(
  userId: string,
  publicOrganizationId: string,
  rawInput: unknown,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "ORGANIZATION_SETTINGS",
  );
  const input = parseOrganizationPrintTemplateInput(rawInput);
  return prisma.$transaction(async (transaction) => {
    if (input.isDefault) {
      await transaction.organizationPrintTemplate.updateMany({
        where: {
          organization_id: membership.organization_id,
          document_type: input.documentType,
          is_default: true,
        },
        data: { is_default: false },
      });
    }

    const template = await transaction.organizationPrintTemplate.create({
      data: {
        organization_id: membership.organization_id,
        document_type: input.documentType,
        name: input.name,
        is_active: input.isActive,
        is_default: input.isDefault,
        design_config: input.designConfig as Prisma.InputJsonObject,
        created_by: userId,
      },
      select: printTemplateSelect,
    });
    await writeAuditEvent(
      transaction,
      membership.organization_id,
      userId,
      "DOCUMENT_PRINT_TEMPLATE_CREATED",
      template,
      { isDefault: template.is_default },
    );
    return mapPrintTemplate(template);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateOrganizationPrintTemplate(
  userId: string,
  publicOrganizationId: string,
  templateId: string,
  rawInput: unknown,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "ORGANIZATION_SETTINGS",
  );
  const input: OrganizationPrintTemplateInput = parseOrganizationPrintTemplateInput(rawInput);
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.organizationPrintTemplate.findFirst({
      where: { organization_id: membership.organization_id, id: templateId },
      select: { id: true, document_type: true, name: true, is_default: true },
    });
    if (!existing) return null;
    if (existing.document_type !== input.documentType) {
      throw new Error("A template's document type cannot be changed after creation.");
    }
    if (input.isDefault) {
      await transaction.organizationPrintTemplate.updateMany({
        where: {
          organization_id: membership.organization_id,
          document_type: input.documentType,
          is_default: true,
          id: { not: templateId },
        },
        data: { is_default: false },
      });
    }

    const template = await transaction.organizationPrintTemplate.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        is_active: input.isActive,
        is_default: input.isActive && input.isDefault,
        design_config: input.designConfig as Prisma.InputJsonObject,
      },
      select: printTemplateSelect,
    });
    await writeAuditEvent(
      transaction,
      membership.organization_id,
      userId,
      "DOCUMENT_PRINT_TEMPLATE_UPDATED",
      template,
      {
        previousName: existing.name,
        previousDefault: existing.is_default,
        isDefault: template.is_default,
      },
    );
    return mapPrintTemplate(template);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getOrganizationPrintTemplateForDocument(
  userId: string,
  publicOrganizationId: string,
  documentType: OrganizationPrintDocumentType,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "VIEW_REPORTS",
  );
  const template = await prisma.organizationPrintTemplate.findFirst({
    where: {
      organization_id: membership.organization_id,
      document_type: documentType,
      is_active: true,
      is_default: true,
    },
    select: { design_config: true },
  });
  return template ? parseOrganizationPrintTemplateDesign(template.design_config) : null;
}
