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

export type CreateOrderQrPrintRequestInput = {
  orderId: string;
  templateId: string | null;
  requestType: OrderQrPrintRequestType;
};

export function parseCreateOrderQrPrintRequestInput(
  value: unknown,
):
  | { success: true; data: CreateOrderQrPrintRequestInput }
  | { success: false; error: string } {
  if (!isRecord(value)) {
    return { success: false, error: "Request details are required." };
  }
  if (typeof value.orderId !== "string" || value.orderId.trim().length === 0) {
    return { success: false, error: "A valid order is required." };
  }
  if (
    typeof value.requestType !== "string"
    || !ORDER_QR_PRINT_REQUEST_TYPES.includes(value.requestType as OrderQrPrintRequestType)
  ) {
    return { success: false, error: "Select Print or Download." };
  }
  if (
    value.templateId !== undefined
    && value.templateId !== null
    && (typeof value.templateId !== "string" || value.templateId.trim().length === 0)
  ) {
    return { success: false, error: "Select a valid QR template." };
  }

  return {
    success: true,
    data: {
      orderId: value.orderId.trim(),
      templateId: typeof value.templateId === "string" ? value.templateId.trim() : null,
      requestType: value.requestType as OrderQrPrintRequestType,
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
  orderNo: string,
) {
  return buildOrderQrPayload(fieldKeys, orderFields, orderNo);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
