import type { OrderFormState } from "./order-form-types";

export type OrderSection = "finishedGoods" | "bom" | "process";

export function buildOrderSavePayload(
  form: OrderFormState,
  organizationId: string,
  orderId: string | undefined,
  loadedSections: ReadonlySet<OrderSection>,
) {
  const payload: Record<string, unknown> = { ...form, organizationId };
  if (!orderId) return payload;

  if (!loadedSections.has("finishedGoods")) delete payload.rows;
  if (!loadedSections.has("bom")) delete payload.bomRows;
  if (!loadedSections.has("process")) {
    delete payload.processRows;
    delete payload.processTemplateId;
  }

  return { id: orderId, ...payload };
}
