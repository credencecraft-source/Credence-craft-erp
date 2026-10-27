import { prisma } from "@/lib/database/prisma-client";
import {
  parseStoredOrderQrTemplateDesign,
  serializeOrderQrTemplateDesign,
  type OrderQrTemplateFieldKey,
} from "./order-qr-template-contract";
import {
  buildRequestQrPayload,
  getNextOrderQrPrintRequestStatus,
  isOrderQrTemplateFieldKey,
  type CreateOrderQrPrintRequestInput,
  type OrderQrPrintRequestStatus,
} from "./order-qr-print-request-contract";

function normalizeTemplateFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isOrderQrTemplateFieldKey);
}

function mapRequest(request: {
  id: string;
  order_id: string;
  order_no: string;
  request_type: string;
  status: string;
  template_name: string | null;
  qr_field_key?: string;
  display_fields?: unknown;
  display_values?: unknown;
  display_field_styles?: unknown;
  qr_size: number;
  sticker_width_mm?: number | { toNumber(): number };
  sticker_length_mm?: number | { toNumber(): number };
  qr_payload?: string;
  requested_at: Date;
  updated_at: Date;
}) {
  const design = parseStoredOrderQrTemplateDesign(
    request.display_field_styles,
    normalizeTemplateFields(request.display_fields),
  );
  return {
    id: request.id,
    orderId: request.order_id,
    orderNo: request.order_no,
    requestType: request.request_type,
    status: request.status,
    templateName: request.template_name,
    qrFieldKey: request.qr_field_key ?? "orderNo",
    displayFields: normalizeTemplateFields(request.display_fields),
    displayValues: normalizeDisplayValues(
      request.display_values,
      normalizeTemplateFields(request.display_fields),
    ),
    ...design,
    qrSize: request.qr_size,
    stickerWidthMm: typeof request.sticker_width_mm === "number"
      ? request.sticker_width_mm
      : request.sticker_width_mm?.toNumber() ?? 50,
    stickerLengthMm: typeof request.sticker_length_mm === "number"
      ? request.sticker_length_mm
      : request.sticker_length_mm?.toNumber() ?? 30,
    ...(request.qr_payload !== undefined ? { qrPayload: request.qr_payload } : {}),
    requestedAt: request.requested_at.toISOString(),
    updatedAt: request.updated_at.toISOString(),
  };
}

function normalizeDisplayValues(
  value: unknown,
  displayFields: ReturnType<typeof normalizeTemplateFields>,
): Partial<Record<OrderQrTemplateFieldKey, string>> {
  const saved = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const values: Partial<Record<OrderQrTemplateFieldKey, string>> = {};
  for (const key of displayFields) {
    if (typeof saved[key] === "string") values[key] = saved[key] as string;
  }
  return values;
}

export async function listOrderQrPrintRequests(organizationId: string) {
  const requests = await prisma.merchandisingOrderQrPrintRequest.findMany({
    where: { organization_id: organizationId },
    orderBy: [{ requested_at: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      order_id: true,
      order_no: true,
      request_type: true,
      status: true,
      template_name: true,
      qr_size: true,
      qr_field_key: true,
      display_fields: true,
      display_values: true,
      display_field_styles: true,
      sticker_width_mm: true,
      sticker_length_mm: true,
      qr_payload: true,
      requested_at: true,
      updated_at: true,
    },
  });
  return requests.map(mapRequest);
}

export async function createOrderQrPrintRequest(
  organizationId: string,
  userId: string,
  input: CreateOrderQrPrintRequestInput,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;

    const order = await transaction.merchandisingOrder.findFirst({
      where: { organization_id: organizationId, id: input.orderId },
      select: {
        id: true,
        orderNo: true,
        entityName: true,
        category: true,
        subCategory: true,
        season: true,
        article: true,
        styleName: true,
        colors: true,
        buyer: true,
        brand: true,
        sizeGroup: true,
        orderQty: true,
        deliveryDate: true,
      },
    });
    if (!order) return { success: false as const, reason: "ORDER_NOT_FOUND" as const };

    const template = input.templateId
      ? await transaction.merchandisingOrderQrTemplate.findFirst({
          where: { organization_id: organizationId, id: input.templateId },
        select: {
          name: true,
          field_keys: true,
          qr_field_key: true,
          display_fields: true,
          display_field_styles: true,
          qr_size: true,
          sticker_width_mm: true,
          sticker_length_mm: true,
        },
      })
      : null;
    if (input.templateId && !template) {
      return { success: false as const, reason: "TEMPLATE_NOT_FOUND" as const };
    }

    const legacyFieldKeys = normalizeTemplateFields(template?.field_keys);
    const qrFieldKey = template && isOrderQrTemplateFieldKey(template.qr_field_key)
      ? template.qr_field_key
      : legacyFieldKeys[0] ?? "orderNo";
    const displayFields = template
      ? normalizeTemplateFields(template.display_fields ?? legacyFieldKeys)
      : [];
    const design = parseStoredOrderQrTemplateDesign(
      template?.display_field_styles,
      displayFields,
    );
    const { displayFieldStyles, layout } = design;
    const orderFields = {
      orderNo: order.orderNo,
      entityName: order.entityName,
      category: order.category,
      subCategory: order.subCategory,
      season: order.season,
      article: order.article,
      styleName: order.styleName,
      colors: order.colors,
      buyer: order.buyer,
      brand: order.brand,
      sizeGroup: order.sizeGroup,
      orderQty: order.orderQty,
      deliveryDate: order.deliveryDate?.toISOString().slice(0, 10) ?? null,
    };
    const displayValues = Object.fromEntries(displayFields.flatMap((key) => {
      const value = orderFields[key];
      return value === null || value === undefined || String(value).trim() === ""
        ? []
        : [[key, String(value)]];
    }));
    const qrContent = buildRequestQrPayload([qrFieldKey], {
      ...orderFields,
    }, order.orderNo);

    const request = await transaction.merchandisingOrderQrPrintRequest.create({
      data: {
        organization_id: organizationId,
        order_id: order.id,
        order_no: order.orderNo,
        request_type: input.requestType,
        template_name: template?.name ?? null,
        field_keys: [...new Set([qrFieldKey, ...displayFields])],
        qr_field_key: qrFieldKey,
        display_fields: displayFields,
        display_values: displayValues,
        display_field_styles: serializeOrderQrTemplateDesign(displayFieldStyles, layout),
        qr_size: template?.qr_size ?? 256,
        sticker_width_mm: template?.sticker_width_mm ?? 50,
        sticker_length_mm: template?.sticker_length_mm ?? 30,
        qr_payload: qrContent.payload,
        requested_by: userId,
      },
      select: {
        id: true,
        order_id: true,
        order_no: true,
        request_type: true,
        status: true,
        template_name: true,
        qr_size: true,
        qr_field_key: true,
        display_fields: true,
        display_values: true,
        display_field_styles: true,
        sticker_width_mm: true,
        sticker_length_mm: true,
        requested_at: true,
        updated_at: true,
      },
    });
    return { success: true as const, request: mapRequest(request) };
  });
}

export async function advanceOrderQrPrintRequestStatus(
  organizationId: string,
  userId: string,
  requestId: string,
  targetStatus: OrderQrPrintRequestStatus,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const existing = await transaction.merchandisingOrderQrPrintRequest.findFirst({
      where: { organization_id: organizationId, id: requestId },
      select: { status: true },
    });
    if (!existing) return { success: false as const, reason: "NOT_FOUND" as const };

    const currentStatus = existing.status as OrderQrPrintRequestStatus;
    if (getNextOrderQrPrintRequestStatus(currentStatus) !== targetStatus) {
      return { success: false as const, reason: "INVALID_TRANSITION" as const };
    }
    const updated = await transaction.merchandisingOrderQrPrintRequest.updateMany({
      where: {
        organization_id: organizationId,
        id: requestId,
        status: currentStatus,
      },
      data: { status: targetStatus },
    });
    if (updated.count !== 1) {
      return { success: false as const, reason: "INVALID_TRANSITION" as const };
    }

    const request = await transaction.merchandisingOrderQrPrintRequest.findFirst({
      where: { organization_id: organizationId, id: requestId },
      select: {
        id: true,
        order_id: true,
        order_no: true,
        request_type: true,
        status: true,
        template_name: true,
        qr_size: true,
        qr_field_key: true,
        display_fields: true,
        display_values: true,
        display_field_styles: true,
        sticker_width_mm: true,
        sticker_length_mm: true,
        requested_at: true,
        updated_at: true,
      },
    });
    if (!request) return { success: false as const, reason: "NOT_FOUND" as const };
    return { success: true as const, request: mapRequest(request) };
  });
}
