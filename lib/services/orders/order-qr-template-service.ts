import { prisma } from "@/lib/database/prisma-client";
import {
  ORDER_QR_TEMPLATE_SIZES,
  isOrderQrTemplateFieldKey,
  parseStoredOrderQrTemplateDesign,
  serializeOrderQrTemplateDesign,
} from "./order-qr-template-contract";
import type { OrderQrTemplateInput } from "./order-qr-template-contract";

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
  return {
    id: template.id,
    name: template.name,
    type: template.type,
    fieldKeys: [...new Set([qrFieldKey, ...displayFields])],
    qrFieldKey,
    displayFields,
    displayFieldStyles: design.displayFieldStyles,
    layout: design.layout,
    qrSize: ORDER_QR_TEMPLATE_SIZES.includes(
      template.qr_size as (typeof ORDER_QR_TEMPLATE_SIZES)[number],
    ) ? template.qr_size : 256,
    stickerWidthMm: typeof template.sticker_width_mm === "number"
      ? template.sticker_width_mm
      : template.sticker_width_mm?.toNumber() ?? 50,
    stickerLengthMm: typeof template.sticker_length_mm === "number"
      ? template.sticker_length_mm
      : template.sticker_length_mm?.toNumber() ?? 30,
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
          input.layout,
        ),
        qr_size: input.qrSize,
        sticker_width_mm: input.stickerWidthMm,
        sticker_length_mm: input.stickerLengthMm,
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
    const updated = await transaction.merchandisingOrderQrTemplate.updateMany({
      where: { organization_id: organizationId, id: templateId },
      data: {
        name: input.name,
        field_keys: [...new Set([input.qrFieldKey, ...input.displayFields])],
        qr_field_key: input.qrFieldKey,
        display_fields: input.displayFields,
        display_field_styles: serializeOrderQrTemplateDesign(
          input.displayFieldStyles,
          input.layout,
        ),
        qr_size: input.qrSize,
        sticker_width_mm: input.stickerWidthMm,
        sticker_length_mm: input.stickerLengthMm,
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
