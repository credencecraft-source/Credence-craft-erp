import {
  ORDER_QR_TEMPLATE_FIELDS,
  buildOrderQrPayload,
  type OrderQrTemplateFieldKey,
} from "./order-qr-template-contract";

export const ORDER_QR_PRINT_REQUEST_TYPES = ["PRINT", "DOWNLOAD"] as const;
export const ORDER_QR_PRINT_REQUEST_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
] as const;

export type OrderQrPrintRequestType = (typeof ORDER_QR_PRINT_REQUEST_TYPES)[number];
export type OrderQrPrintRequestStatus = (typeof ORDER_QR_PRINT_REQUEST_STATUSES)[number];
export const ORDER_QR_QUANTITY_MODES = ["PCS", "BULK_QTY"] as const;
export type OrderQrQuantityMode = (typeof ORDER_QR_QUANTITY_MODES)[number];
export type OrderQrPrintPreviewMode =
  | "page-setup-sheet"
  | "page-setup-required"
  | "single-sticker";
export const MAX_ORDER_QR_PRINT_REQUEST_ORDERS = 100;
export const MAX_ORDER_QR_PRINT_REQUEST_LABELS = 10_000;

export function getOrderQrPrintPreviewMode(
  printerType: string,
  hasPageSetup: boolean,
): OrderQrPrintPreviewMode {
  if (hasPageSetup) return "page-setup-sheet";
  return printerType === "LASER" ? "page-setup-required" : "single-sticker";
}

export type CreateOrderQrPrintRequestInput = {
  orderId?: string;
  bulkOrders?: Array<{ orderId: string; quantity: number }>;
  templateId: string;
  requestType: OrderQrPrintRequestType;
  quantityMode?: OrderQrQuantityMode;
  bulkQuantity?: number;
};

export function parseCreateOrderQrPrintRequestInput(
  value: unknown,
):
  | { success: true; data: CreateOrderQrPrintRequestInput }
  | { success: false; error: string } {
  if (!isRecord(value)) {
    return { success: false, error: "Request details are required." };
  }
  const orderId = typeof value.orderId === "string" ? value.orderId.trim() : "";
  let bulkOrders: Array<{ orderId: string; quantity: number }> | undefined;
  if (value.bulkOrders !== undefined) {
    if (
      !Array.isArray(value.bulkOrders)
      || value.bulkOrders.length === 0
      || value.bulkOrders.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS
    ) {
      return {
        success: false,
        error: `Select between 1 and ${MAX_ORDER_QR_PRINT_REQUEST_ORDERS} orders for a bulk QR request.`,
      };
    }
    const parsedBulkOrders: Array<{ orderId: string; quantity: number }> = [];
    const seenOrderIds = new Set<string>();
    for (const entry of value.bulkOrders) {
      if (!isRecord(entry) || typeof entry.orderId !== "string" || !entry.orderId.trim()) {
        return { success: false, error: "Every bulk QR order must have a valid order ID." };
      }
      const bulkOrderId = entry.orderId.trim();
      if (seenOrderIds.has(bulkOrderId)) {
        return { success: false, error: "Bulk QR requests cannot contain duplicate orders." };
      }
      if (
        typeof entry.quantity !== "number"
        || !Number.isSafeInteger(entry.quantity)
        || entry.quantity < 1
      ) {
        return { success: false, error: "Every bulk order quantity must be a positive whole number." };
      }
      seenOrderIds.add(bulkOrderId);
      parsedBulkOrders.push({ orderId: bulkOrderId, quantity: entry.quantity });
    }
    if (
      parsedBulkOrders.reduce((total, item) => total + item.quantity, 0)
      > MAX_ORDER_QR_PRINT_REQUEST_LABELS
    ) {
      return {
        success: false,
        error: `A QR request cannot exceed ${MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()} labels.`,
      };
    }
    bulkOrders = parsedBulkOrders;
  }
  if (!orderId && !bulkOrders) {
    return { success: false, error: "A valid order is required." };
  }
  if (orderId && bulkOrders) {
    return { success: false, error: "Submit either one order or a bulk order list, not both." };
  }
  if (
    typeof value.requestType !== "string"
    || !ORDER_QR_PRINT_REQUEST_TYPES.includes(value.requestType as OrderQrPrintRequestType)
  ) {
    return { success: false, error: "Select Print or Download." };
  }
  if (typeof value.templateId !== "string" || value.templateId.trim().length === 0) {
    return { success: false, error: "Select a QR template before requesting print or download." };
  }
  if (
    value.quantityMode !== undefined
    && (typeof value.quantityMode !== "string"
      || !ORDER_QR_QUANTITY_MODES.includes(value.quantityMode as OrderQrQuantityMode))
  ) {
    return { success: false, error: "Select PCS or Bulk Qty." };
  }
  if (
    bulkOrders
    && value.quantityMode === "PCS"
    && bulkOrders.some((item) => item.quantity !== 1)
  ) {
    return { success: false, error: "PCS requests must use quantity 1 for every selected order." };
  }
  if (
    value.bulkQuantity !== undefined
    && (typeof value.bulkQuantity !== "number"
      || !Number.isSafeInteger(value.bulkQuantity)
      || value.bulkQuantity < 1
      || value.bulkQuantity > MAX_ORDER_QR_PRINT_REQUEST_LABELS)
  ) {
    return {
      success: false,
      error: `Bulk quantity must be a positive whole number up to ${MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()}.`,
    };
  }

  return {
    success: true,
    data: {
      ...(orderId ? { orderId } : {}),
      ...(bulkOrders ? { bulkOrders } : {}),
      templateId: value.templateId.trim(),
      requestType: value.requestType as OrderQrPrintRequestType,
      quantityMode: value.quantityMode === "PCS" ? "PCS" : "BULK_QTY",
      ...(value.bulkQuantity !== undefined ? { bulkQuantity: value.bulkQuantity as number } : {}),
    },
  };
}

export function isOrderQrPrintRequestStatus(value: unknown): value is OrderQrPrintRequestStatus {
  return typeof value === "string"
    && ORDER_QR_PRINT_REQUEST_STATUSES.includes(value as OrderQrPrintRequestStatus);
}

export function getNextOrderQrPrintRequestStatus(
  current: OrderQrPrintRequestStatus,
): OrderQrPrintRequestStatus | null {
  if (current === "PENDING") return "IN_PROGRESS";
  if (current === "IN_PROGRESS") return "COMPLETED";
  return null;
}

export function isOrderQrTemplateFieldKey(value: unknown): value is OrderQrTemplateFieldKey {
  return typeof value === "string"
    && ORDER_QR_TEMPLATE_FIELDS.some((field) => field.key === value);
}

export function buildRequestQrPayload(
  fieldKeys: readonly OrderQrTemplateFieldKey[],
  orderFields: Partial<Record<OrderQrTemplateFieldKey, string | number | null>>,
) {
  return buildOrderQrPayload(fieldKeys, orderFields);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
