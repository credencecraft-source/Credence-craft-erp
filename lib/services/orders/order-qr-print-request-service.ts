import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import {
  parsePageSetupPrintSnapshot,
} from "@/lib/services/design-development/page-setup-template-contract";
import {
  parseStoredOrderQrTemplateDesign,
  serializeOrderQrTemplateDesign,
  type OrderQrTemplateFieldKey,
} from "./order-qr-template-contract";
import {
  buildRequestQrPayload,
  getNextOrderQrPrintRequestStatus,
  isOrderQrTemplateFieldKey,
  MAX_ORDER_QR_PRINT_REQUEST_LABELS,
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
  qr_payload: string;
  requested_at: Date;
  updated_at: Date;
}) {
  const savedValues = getJsonObject(request.display_values);
  const design = parseStoredOrderQrTemplateDesign(
    request.display_field_styles,
    normalizeTemplateFields(request.display_fields),
  );
  const pageSetup = parsePageSetupPrintSnapshot(savedValues.__pageSetup) ?? design.pageSetup;
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
    bulkItems: getBulkItems(request.display_values),
    pageSetup,
    printQuantity: getPrintQuantity(request.display_values),
    displayFieldStyles: design.displayFieldStyles,
    layout: design.layout,
    qrSize: request.qr_size,
    stickerWidthMm: pageSetup?.stickerWidthMm ?? (typeof request.sticker_width_mm === "number"
      ? request.sticker_width_mm
      : request.sticker_width_mm?.toNumber() ?? 50),
    stickerLengthMm: pageSetup?.stickerLengthMm ?? (typeof request.sticker_length_mm === "number"
      ? request.sticker_length_mm
      : request.sticker_length_mm?.toNumber() ?? 30),
    qrPayload: request.qr_payload,
    requestedAt: request.requested_at.toISOString(),
    updatedAt: request.updated_at.toISOString(),
  };
}

export type OrderQrPrintRequestRecord = ReturnType<typeof mapRequest>;

export class OrderQrPrintRequestDeleteConflictError extends Error {
  constructor() {
    super("A QR print/download request changed during deletion.");
    this.name = "OrderQrPrintRequestDeleteConflictError";
  }
}

function getJsonObject(value: unknown): Prisma.JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Prisma.JsonObject;
  }
  return {};
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

function getPrintQuantity(value: unknown): number {
  const saved = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const printQuantity = Number(saved.__printQuantity ?? saved.orderQty ?? 1);
  return Number.isSafeInteger(printQuantity) && printQuantity > 0 ? printQuantity : 1;
}

function getBulkItems(value: unknown) {
  const saved = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (!Array.isArray(saved.__bulkItems)) return [];
  return saved.__bulkItems.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.orderId !== "string"
      || typeof candidate.orderNo !== "string"
      || typeof candidate.styleName !== "string"
      || typeof candidate.quantity !== "number"
      || !Number.isSafeInteger(candidate.quantity)
      || candidate.quantity < 1
      || candidate.quantity > MAX_ORDER_QR_PRINT_REQUEST_LABELS
      || typeof candidate.qrPayload !== "string"
    ) return [];
    return [{
      orderId: candidate.orderId,
      orderNo: candidate.orderNo,
      styleName: candidate.styleName,
      quantity: candidate.quantity,
      qrPayload: candidate.qrPayload,
      displayValues: normalizeDisplayValues(candidate.displayValues, normalizeTemplateFields(saved.__displayFields)),
    }];
  });
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

export async function getOrderQrPrintRequest(
  organizationId: string,
  requestId: string,
) {
  const request = await prisma.merchandisingOrderQrPrintRequest.findFirst({
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
      qr_payload: true,
      requested_at: true,
      updated_at: true,
    },
  });
  return request ? mapRequest(request) : null;
}

export async function deletePendingOrderQrPrintRequests(
  organizationId: string,
  userId: string,
  requestIds: string[],
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const existing = await transaction.merchandisingOrderQrPrintRequest.findMany({
      where: {
        organization_id: organizationId,
        id: { in: requestIds },
      },
      select: { id: true, status: true },
    });
    if (existing.length !== requestIds.length) {
      return { success: false as const, reason: "NOT_FOUND" as const };
    }
    if (existing.some((request) => request.status !== "PENDING")) {
      return { success: false as const, reason: "LOCKED" as const };
    }

    const deleted = await transaction.merchandisingOrderQrPrintRequest.deleteMany({
      where: {
        organization_id: organizationId,
        id: { in: requestIds },
        status: "PENDING",
      },
    });
    if (deleted.count !== requestIds.length) {
      throw new OrderQrPrintRequestDeleteConflictError();
    }
    return { success: true as const, deletedCount: deleted.count };
  });
}

export async function createOrderQrPrintRequest(
  organizationId: string,
  userId: string,
  input: CreateOrderQrPrintRequestInput,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;

    const orderSelect = {
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
    };
    const orders = input.bulkOrders
      ? await transaction.merchandisingOrder.findMany({
        where: {
          organization_id: organizationId,
          id: { in: input.bulkOrders.map(({ orderId }) => orderId) },
        },
        select: orderSelect,
      })
      : await transaction.merchandisingOrder.findFirst({
        where: { organization_id: organizationId, id: input.orderId },
        select: orderSelect,
      });
    const scopedOrders = Array.isArray(orders) ? orders : orders ? [orders] : [];
    if (
      scopedOrders.length === 0
      || (input.bulkOrders && scopedOrders.length !== input.bulkOrders.length)
    ) {
      return { success: false as const, reason: "ORDER_NOT_FOUND" as const };
    }
    const ordersById = new Map(scopedOrders.map((order) => [order.id, order]));
    const selectedOrders = input.bulkOrders
      ? input.bulkOrders.flatMap((item) => {
        const order = ordersById.get(item.orderId);
        return order ? [{ order, quantity: item.quantity }] : [];
      })
      : [{ order: scopedOrders[0], quantity: input.quantityMode === "PCS"
        ? 1
        : input.bulkQuantity ?? scopedOrders[0].orderQty ?? 0 }];
    const requestedLabelCount = selectedOrders.reduce(
      (total, item) => total + Number(item.quantity),
      0,
    );
    if (
      selectedOrders.some(({ quantity }) =>
        !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1,
      )
      || !Number.isSafeInteger(requestedLabelCount)
      || requestedLabelCount > MAX_ORDER_QR_PRINT_REQUEST_LABELS
    ) {
      return { success: false as const, reason: "INVALID_QUANTITY" as const };
    }

    const template = await transaction.merchandisingOrderQrTemplate.findFirst({
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
    });
    if (!template) {
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
    if (!design.pageSetup) {
      return { success: false as const, reason: "PAGE_SETUP_REQUIRED" as const };
    }
    const { displayFieldStyles, layout } = design;
    const orderFieldsFor = (order: (typeof scopedOrders)[number], quantity: number) => ({
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
      orderQty: quantity,
      deliveryDate: order.deliveryDate?.toISOString().slice(0, 10) ?? null,
    });
    const bulkSnapshots = selectedOrders.map(({ order, quantity }) => {
      const fields = orderFieldsFor(order, quantity);
      const displayValues = Object.fromEntries(displayFields.flatMap((key) => {
        const value = fields[key];
        return value === null || value === undefined || String(value).trim() === ""
          ? []
          : [[key, String(value)]];
      }));
      const qrContent = buildRequestQrPayload([qrFieldKey], fields);
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        styleName: order.styleName ?? "",
        quantity: Number(quantity),
        qrPayload: qrContent.payload,
        displayValues,
      };
    });
    const primaryOrder = selectedOrders[0].order;
    const displayValues = bulkSnapshots[0].displayValues;
    const printQuantity = requestedLabelCount;
    if (bulkSnapshots.some((item) => !item.qrPayload)) {
      return { success: false as const, reason: "QR_FIELD_VALUE_MISSING" as const };
    }
    const qrPayload = bulkSnapshots.length > 1
      ? JSON.stringify(bulkSnapshots.map(({ orderNo, qrPayload }) => ({ orderNo, qrPayload })))
      : bulkSnapshots[0].qrPayload;

    const request = await transaction.merchandisingOrderQrPrintRequest.create({
      data: {
        organization_id: organizationId,
        order_id: primaryOrder.id,
        order_no: bulkSnapshots.length > 1
          ? `BULK: ${bulkSnapshots.length} ORDERS`
          : primaryOrder.orderNo,
        request_type: input.requestType,
        template_name: template?.name ?? null,
        field_keys: [...new Set([qrFieldKey, ...displayFields])],
        qr_field_key: qrFieldKey,
        display_fields: displayFields,
        display_values: {
          ...displayValues,
          __printQuantity: printQuantity,
          __pageSetup: design.pageSetup,
          ...(bulkSnapshots.length > 1
            ? { __displayFields: displayFields, __bulkItems: bulkSnapshots }
            : {}),
        },
        display_field_styles: serializeOrderQrTemplateDesign(
          displayFieldStyles,
          layout,
          design.pageSetup,
        ),
        qr_size: template?.qr_size ?? 256,
        sticker_width_mm: design.pageSetup.stickerWidthMm,
        sticker_length_mm: design.pageSetup.stickerLengthMm,
        qr_payload: qrPayload,
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
        qr_payload: true,
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
        qr_payload: true,
        requested_at: true,
        updated_at: true,
      },
    });
    if (!request) return { success: false as const, reason: "NOT_FOUND" as const };
    return { success: true as const, request: mapRequest(request) };
  });
}
