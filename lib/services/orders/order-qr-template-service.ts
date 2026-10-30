import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import {
  parsePageSetupPrintSnapshot,
  type PageSetupPrintSnapshot,
} from "@/lib/services/design-development/page-setup-template-contract";
import {
  ORDER_QR_TEMPLATE_SIZES,
  isOrderQrTemplateFieldKey,
  parseStoredOrderQrTemplateDesign,
  serializeOrderQrTemplateDesign,
} from "./order-qr-template-contract";
import type { OrderQrTemplateInput } from "./order-qr-template-contract";

export class OrderQrTemplateDeleteConflictError extends Error {
  constructor() {
    super("The QR template selection changed during deletion.");
    this.name = "OrderQrTemplateDeleteConflictError";
  }
}

export class OrderQrTemplatePageSetupNotFoundError extends Error {
  constructor() {
    super("The selected Page Setup template is not available in this organization.");
    this.name = "OrderQrTemplatePageSetupNotFoundError";
  }
}

function mapPageSetup(template: {
  id: string;
  name: string;
  paper_size: string;
  orientation: string;
  sticker_width_mm: number | { toNumber(): number };
  sticker_length_mm: number | { toNumber(): number };
  margin_top_mm: number | { toNumber(): number };
  margin_bottom_mm: number | { toNumber(): number };
  margin_left_mm: number | { toNumber(): number };
  margin_right_mm: number | { toNumber(): number };
  horizontal_gap_mm: number | { toNumber(): number };
  vertical_gap_mm: number | { toNumber(): number };
}): PageSetupPrintSnapshot | null {
  return parsePageSetupPrintSnapshot({
    id: template.id,
    name: template.name,
    paperSize: template.paper_size,
    orientation: template.orientation,
    stickerWidthMm: typeof template.sticker_width_mm === "number"
      ? template.sticker_width_mm
      : template.sticker_width_mm.toNumber(),
    stickerLengthMm: typeof template.sticker_length_mm === "number"
      ? template.sticker_length_mm
      : template.sticker_length_mm.toNumber(),
    marginTopMm: typeof template.margin_top_mm === "number"
      ? template.margin_top_mm
      : template.margin_top_mm.toNumber(),
    marginBottomMm: typeof template.margin_bottom_mm === "number"
      ? template.margin_bottom_mm
      : template.margin_bottom_mm.toNumber(),
    marginLeftMm: typeof template.margin_left_mm === "number"
      ? template.margin_left_mm
      : template.margin_left_mm.toNumber(),
    marginRightMm: typeof template.margin_right_mm === "number"
      ? template.margin_right_mm
      : template.margin_right_mm.toNumber(),
    horizontalGapMm: typeof template.horizontal_gap_mm === "number"
      ? template.horizontal_gap_mm
      : template.horizontal_gap_mm.toNumber(),
    verticalGapMm: typeof template.vertical_gap_mm === "number"
      ? template.vertical_gap_mm
      : template.vertical_gap_mm.toNumber(),
  });
}

async function getSelectedPageSetup(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  templateId: string,
) {
  const template = await transaction.designDevelopmentPageSetupTemplate.findFirst({
    where: { organization_id: organizationId, id: templateId },
    select: {
      id: true,
      name: true,
      paper_size: true,
      orientation: true,
      sticker_width_mm: true,
      sticker_length_mm: true,
      margin_top_mm: true,
      margin_bottom_mm: true,
      margin_left_mm: true,
      margin_right_mm: true,
      horizontal_gap_mm: true,
      vertical_gap_mm: true,
    },
  });
  if (!template) throw new OrderQrTemplatePageSetupNotFoundError();

  const pageSetup = mapPageSetup(template);
  if (!pageSetup) {
    throw new Error("The selected Page Setup contains invalid print dimensions.");
  }
  return pageSetup;
}

function validFieldKeys(value: unknown) {
  return Array.isArray(value) ? value.filter(isOrderQrTemplateFieldKey) : [];
}

function mapOrderQrTemplate(template: {
  id: string;
  name: string;
  type: string;
  field_keys: unknown;
  qr_field_key?: string;
  display_fields?: unknown;
  display_field_styles?: unknown;
  qr_size: number;
  sticker_width_mm?: number | { toNumber(): number };
  sticker_length_mm?: number | { toNumber(): number };
  updated_at: Date;
}) {
  const legacyFields = validFieldKeys(template.field_keys);
  const displayFields = template.display_fields === undefined
    ? legacyFields
    : validFieldKeys(template.display_fields);
  const qrFieldKey = isOrderQrTemplateFieldKey(template.qr_field_key)
    ? template.qr_field_key
    : legacyFields[0] ?? "orderNo";
  const design = parseStoredOrderQrTemplateDesign(template.display_field_styles, displayFields);
  const pageSetup = design.pageSetup;
  return {
    id: template.id,
    name: template.name,
    type: template.type,
    fieldKeys: [...new Set([qrFieldKey, ...displayFields])],
    qrFieldKey,
    displayFields,
    displayFieldStyles: design.displayFieldStyles,
    layout: design.layout,
    pageSetup: design.pageSetup,
    qrSize: ORDER_QR_TEMPLATE_SIZES.includes(
      template.qr_size as (typeof ORDER_QR_TEMPLATE_SIZES)[number],
    ) ? template.qr_size : 256,
    stickerWidthMm: pageSetup?.stickerWidthMm ?? (typeof template.sticker_width_mm === "number"
      ? template.sticker_width_mm
      : template.sticker_width_mm?.toNumber() ?? 50),
    stickerLengthMm: pageSetup?.stickerLengthMm ?? (typeof template.sticker_length_mm === "number"
      ? template.sticker_length_mm
      : template.sticker_length_mm?.toNumber() ?? 30),
    updatedAt: template.updated_at.toISOString(),
  };
}

export async function listOrderQrTemplates(organizationId: string) {
  const templates = await prisma.merchandisingOrderQrTemplate.findMany({
    where: { organization_id: organizationId },
    orderBy: [{ updated_at: "desc" }, { name: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      type: true,
      field_keys: true,
      qr_field_key: true,
      display_fields: true,
      display_field_styles: true,
      qr_size: true,
      sticker_width_mm: true,
      sticker_length_mm: true,
      updated_at: true,
    },
  });

  return templates.map(mapOrderQrTemplate);
}

export async function getOrderQrTemplate(organizationId: string, templateId: string) {
  const template = await prisma.merchandisingOrderQrTemplate.findFirst({
    where: { organization_id: organizationId, id: templateId },
    select: {
      id: true,
      name: true,
      type: true,
      field_keys: true,
      qr_field_key: true,
      display_fields: true,
      display_field_styles: true,
      qr_size: true,
      sticker_width_mm: true,
      sticker_length_mm: true,
      updated_at: true,
    },
  });
  return template ? mapOrderQrTemplate(template) : null;
}

export async function createOrderQrTemplate(
  organizationId: string,
  userId: string,
  input: OrderQrTemplateInput,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const pageSetup = await getSelectedPageSetup(
      transaction,
      organizationId,
      input.pageSetupTemplateId,
    );
    const layout = { ...input.layout, printerType: "LASER" as const };

    const template = await transaction.merchandisingOrderQrTemplate.create({
      data: {
        organization_id: organizationId,
        name: input.name,
        type: "ORDER_TAGS",
        field_keys: [...new Set([input.qrFieldKey, ...input.displayFields])],
        qr_field_key: input.qrFieldKey,
        display_fields: input.displayFields,
        display_field_styles: serializeOrderQrTemplateDesign(
          input.displayFieldStyles,
          layout,
          pageSetup,
        ),
        qr_size: input.qrSize,
        sticker_width_mm: pageSetup.stickerWidthMm,
        sticker_length_mm: pageSetup.stickerLengthMm,
      },
      select: {
        id: true,
        name: true,
        type: true,
        field_keys: true,
        qr_field_key: true,
        display_fields: true,
        display_field_styles: true,
        qr_size: true,
        sticker_width_mm: true,
        sticker_length_mm: true,
        updated_at: true,
      },
    });

    return mapOrderQrTemplate(template);
  });
}

export async function updateOrderQrTemplate(
  organizationId: string,
  userId: string,
  templateId: string,
  input: OrderQrTemplateInput,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const currentTemplate = await transaction.merchandisingOrderQrTemplate.findFirst({
      where: { organization_id: organizationId, id: templateId },
      select: { display_field_styles: true },
    });
    if (!currentTemplate) return null;
    const currentDesign = parseStoredOrderQrTemplateDesign(
      currentTemplate.display_field_styles,
      input.displayFields,
    );
    const pageSetup = currentDesign.pageSetup?.id === input.pageSetupTemplateId
      ? currentDesign.pageSetup
      : await getSelectedPageSetup(transaction, organizationId, input.pageSetupTemplateId);
    const layout = { ...input.layout, printerType: "LASER" as const };
    const updated = await transaction.merchandisingOrderQrTemplate.updateMany({
      where: { organization_id: organizationId, id: templateId },
      data: {
        name: input.name,
        field_keys: [...new Set([input.qrFieldKey, ...input.displayFields])],
        qr_field_key: input.qrFieldKey,
        display_fields: input.displayFields,
        display_field_styles: serializeOrderQrTemplateDesign(
          input.displayFieldStyles,
          layout,
          pageSetup,
        ),
        qr_size: input.qrSize,
        sticker_width_mm: pageSetup.stickerWidthMm,
        sticker_length_mm: pageSetup.stickerLengthMm,
      },
    });
    if (updated.count !== 1) return null;

    const template = await transaction.merchandisingOrderQrTemplate.findFirst({
      where: { organization_id: organizationId, id: templateId },
      select: {
        id: true,
        name: true,
        type: true,
        field_keys: true,
        qr_field_key: true,
        display_fields: true,
        display_field_styles: true,
        qr_size: true,
        sticker_width_mm: true,
        sticker_length_mm: true,
        updated_at: true,
      },
    });
    return template ? mapOrderQrTemplate(template) : null;
  });
}

export async function deleteOrderQrTemplates(
  organizationId: string,
  userId: string,
  templateIds: string[],
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const existing = await transaction.merchandisingOrderQrTemplate.findMany({
      where: {
        organization_id: organizationId,
        id: { in: templateIds },
      },
      select: { id: true },
    });
    if (existing.length !== templateIds.length) {
      return { success: false as const, reason: "NOT_FOUND" as const };
    }

    const deleted = await transaction.merchandisingOrderQrTemplate.deleteMany({
      where: {
        organization_id: organizationId,
        id: { in: templateIds },
      },
    });
    if (deleted.count !== templateIds.length) {
      throw new OrderQrTemplateDeleteConflictError();
    }
    return { success: true as const, deletedCount: deleted.count };
  });
}
