import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import {
  parsePageSetupPrintSnapshot,
} from "@/lib/services/design-development/page-setup-template-contract";
import {
  parseStoredOrderQrTemplateDesign,
  serializeOrderQrTemplateDesign,
  isOrderQrTemplateFieldKey,
  type QrTemplateFieldKey,
} from "./order-qr-template-contract";
import {
  buildRequestQrPayload,
  getNextOrderQrPrintRequestStatus,
  MAX_FINISHED_GOODS_QR_PRINT_REQUEST_ITEMS,
  MAX_ORDER_QR_PRINT_REQUEST_LABELS,
  type CreateOrderQrPrintRequestInput,
  type OrderQrPrintRequestStatus,
} from "./order-qr-print-request-contract";

export { listFinishedGoodsQrRows } from "./finished-goods-qr-row-service";

function normalizeTemplateFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isOrderQrTemplateFieldKey);
}

function mapRequest(request: {
  id: string;
  source_type?: string;
  order_id: string | null;
  purchase_bill_id?: string | null;
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
    sourceType: request.source_type === "POS_PURCHASE_BILL" || request.purchase_bill_id
      ? "POS_PURCHASE_BILL" as const
      : "ORDER" as const,
    orderId: request.order_id ?? "",
    purchaseBillId: request.purchase_bill_id ?? null,
    orderNo: request.order_no,
    requestType: request.request_type,
    status: request.status,
    templateName: request.template_name,
    qrFieldKey: isOrderQrTemplateFieldKey(request.qr_field_key)
      ? request.qr_field_key
      : "orderNo",
    displayFields: normalizeTemplateFields(request.display_fields),
    displayValues: normalizeDisplayValues(
      request.display_values,
      normalizeTemplateFields(request.display_fields),
    ),
    bulkItems: getBulkItems(request.display_values),
    isFinishedGoodsBarcode: savedValues.__finishedGoodsBarcode === true,
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
): Partial<Record<QrTemplateFieldKey, string>> {
  const saved = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const values: Partial<Record<QrTemplateFieldKey, string>> = {};
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
      source_type: true,
      order_id: true,
      purchase_bill_id: true,
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
      source_type: true,
      order_id: true,
      purchase_bill_id: true,
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

    type RequestItem = {
      id: string;
      orderNo: string;
      styleName: string;
      quantity: number;
      fields: Partial<Record<QrTemplateFieldKey, string | number | null>>;
    };
    let requestItems: RequestItem[];
    let sourceType: "ORDER" | "POS_PURCHASE_BILL";
    let isFinishedGoodsBarcodeRequest = false;
    let requestOrderId: string | null = null;
    let requestPurchaseBillId: string | null = null;
    let requestOrderNo: string;

    if (input.purchaseBillId && input.billLines) {
      sourceType = "POS_PURCHASE_BILL";
      const selectedLineIds = input.billLines.map(({ billLineId }) => billLineId);
      const bill = await transaction.posPurchaseBill.findFirst({
        where: { organization_id: organizationId, id: input.purchaseBillId },
        select: {
          id: true,
          document_number: true,
          bill_number: true,
          bill_date: true,
          status: true,
          vendor_id: true,
          lines: {
            where: { id: { in: selectedLineIds } },
            orderBy: [{ created_at: "asc" }, { id: "asc" }],
            select: {
              id: true,
              item_name: true,
              size: true,
              quantity: true,
              sourceRecord: {
                select: {
                  record_number: true,
                  item_type: true,
                  style_name: true,
                },
              },
              finished_goods_stock: {
                select: { id: true, sku_code: true },
              },
            },
          },
        },
      });
      if (!bill || bill.lines.length !== selectedLineIds.length) {
        return { success: false as const, reason: "PURCHASE_BILL_NOT_FOUND" as const };
      }
      if (!["POSTED", "APPROVED"].includes(bill.status)) {
        return { success: false as const, reason: "PURCHASE_BILL_NOT_READY" as const };
      }
      const vendor = await transaction.masterVendor.findFirst({
        where: { id: bill.vendor_id, organization_id: organizationId },
        select: { vendor: true },
      });
      if (!vendor) {
        return { success: false as const, reason: "PURCHASE_BILL_NOT_FOUND" as const };
      }
      const lineOrder = await transaction.posPurchaseBillLine.findMany({
        where: { purchase_bill_id: bill.id },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const lineNumberById = new Map(
        lineOrder.map((line, index) => [line.id, String(index + 1).padStart(3, "0")]),
      );
      const linesById = new Map(bill.lines.map((line) => [line.id, line]));
      requestItems = input.billLines.flatMap(({ billLineId }) => {
        const line = linesById.get(billLineId);
        if (!line) return [];
        const quantity = input.quantityMode === "PCS" ? 1 : Number(line.quantity.toString());
        const lineCode = line.finished_goods_stock?.sku_code
          || line.finished_goods_stock?.id
          || `${bill.document_number}-L${lineNumberById.get(line.id) ?? "000"}`;
        const source = line.sourceRecord;
        const fields: Partial<Record<QrTemplateFieldKey, string | number | null>> = {
          posItemCode: lineCode,
          posItemName: line.item_name ?? source?.style_name ?? source?.record_number ?? null,
          posSize: line.size,
          posItemType: source?.item_type?.replaceAll("_", " ") ?? null,
          posRecordNumber: source?.record_number ?? null,
          posVendor: vendor.vendor,
          posBillNumber: bill.bill_number,
          posBillDate: bill.bill_date.toISOString().slice(0, 10),
          posBillQuantity: line.quantity.toString(),
          posSkuCode: line.finished_goods_stock?.sku_code ?? line.finished_goods_stock?.id ?? null,
        };
        return [{
          id: line.id,
          orderNo: lineCode,
          styleName: source?.style_name ?? line.item_name ?? source?.record_number ?? "",
          quantity,
          fields,
        }];
      });
      if (requestItems.length !== input.billLines.length) {
        return { success: false as const, reason: "PURCHASE_BILL_NOT_FOUND" as const };
      }
      requestPurchaseBillId = bill.id;
      requestOrderNo = bill.document_number;
    } else {
      sourceType = "ORDER";
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
      const selectedFinishedGoodsOrderIds = input.finishedGoodsItems
        ? [...new Set(input.finishedGoodsItems.map(({ orderId }) => orderId))]
        : undefined;
      const selectedOrderIds = input.bulkOrders?.map(({ orderId }) => orderId)
        ?? selectedFinishedGoodsOrderIds;
      const orders = selectedOrderIds
        ? await transaction.merchandisingOrder.findMany({
          where: {
            organization_id: organizationId,
            id: { in: selectedOrderIds },
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
        || (selectedOrderIds && scopedOrders.length !== selectedOrderIds.length)
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
      if (input.finishedGoodsItems) {
        const selectedRows = await transaction.finishedGoodsSizeWise.findMany({
          where: {
            order_id: { in: selectedFinishedGoodsOrderIds },
            id: { in: input.finishedGoodsItems.map(({ finishedGoodsId }) => finishedGoodsId) },
          },
          orderBy: [{ order_id: "asc" }, { id: "asc" }],
          take: MAX_FINISHED_GOODS_QR_PRINT_REQUEST_ITEMS + 1,
          select: {
            id: true,
            order_id: true,
            buyerSize: true,
            size: true,
            sku_code: true,
            barcode: true,
            totalQty: true,
          },
        });
        const quantityByFinishedGoodsId = new Map(
          input.finishedGoodsItems.map((item) => [item.finishedGoodsId, item]),
        );
        if (
          selectedRows.length !== input.finishedGoodsItems.length
          || selectedRows.some((row) =>
            quantityByFinishedGoodsId.get(row.id)?.orderId !== row.order_id)
        ) {
          return { success: false as const, reason: "FG_VARIANT_NOT_FOUND" as const };
        }
        if (selectedRows.some((row) =>
          Number(row.totalQty ?? 0) > 0
          && (!row.sku_code?.trim() || !row.barcode?.trim())
        )) {
          return { success: false as const, reason: "FG_IDENTIFIERS_MISSING" as const };
        }
        requestItems = selectedRows.flatMap((row) => {
          const order = ordersById.get(row.order_id);
          const selection = quantityByFinishedGoodsId.get(row.id);
          if (!order || !selection) return [];
          const sizeLabel = row.size ?? row.buyerSize ?? "";
          const fields: Partial<Record<QrTemplateFieldKey, string | number | null>> = {
            fgBarcode: row.barcode,
            fgSkuCode: row.sku_code,
            fgSize: row.size,
            fgBuyerSize: row.buyerSize,
            fgOrderNo: order.orderNo,
            fgStyleName: order.styleName,
            fgArticle: order.article,
            fgColor: order.colors,
            fgQuantity: row.totalQty,
          };
          return [{
            id: order.id,
            orderNo: `${order.orderNo}-${sizeLabel || row.id}`,
            styleName: order.styleName ?? "",
            quantity: selection.quantity,
            fields,
          }];
        });
        requestOrderId = scopedOrders[0].id;
        requestOrderNo = scopedOrders.length > 1
          ? `FG BARCODE: ${scopedOrders.length} ORDERS`
          : scopedOrders[0].orderNo;
        isFinishedGoodsBarcodeRequest = true;
      } else if (input.finishedGoodsRows) {
        const order = scopedOrders[0];
        const selectedRows = await transaction.finishedGoodsSizeWise.findMany({
          where: {
            order_id: order.id,
            id: { in: input.finishedGoodsRows.map(({ finishedGoodsId }) => finishedGoodsId) },
          },
          select: {
            id: true,
            buyerSize: true,
            size: true,
            sku_code: true,
            barcode: true,
            totalQty: true,
          },
        });
        if (selectedRows.length !== input.finishedGoodsRows.length) {
          return { success: false as const, reason: "FG_VARIANT_NOT_FOUND" as const };
        }
        const rowsById = new Map(selectedRows.map((row) => [row.id, row]));
        requestItems = input.finishedGoodsRows.flatMap(({ finishedGoodsId, quantity }) => {
          const row = rowsById.get(finishedGoodsId);
          if (!row) return [];
          if (!row.sku_code?.trim() || !row.barcode?.trim()) {
            return [];
          }
          const sizeLabel = row.size ?? row.buyerSize ?? "";
          const fields: Partial<Record<QrTemplateFieldKey, string | number | null>> = {
            fgBarcode: row.barcode,
            fgSkuCode: row.sku_code,
            fgSize: row.size,
            fgBuyerSize: row.buyerSize,
            fgOrderNo: order.orderNo,
            fgStyleName: order.styleName,
            fgArticle: order.article,
            fgColor: order.colors,
            fgQuantity: row.totalQty,
          };
          return [{
            id: order.id,
            orderNo: `${order.orderNo}-${sizeLabel || row.id}`,
            styleName: order.styleName ?? "",
            quantity,
            fields,
          }];
        });
        if (requestItems.length !== selectedRows.length) {
          return { success: false as const, reason: "FG_IDENTIFIERS_MISSING" as const };
        }
        requestOrderId = order.id;
        requestOrderNo = order.orderNo;
        isFinishedGoodsBarcodeRequest = true;
      } else {
        requestItems = selectedOrders.map(({ order, quantity }) => ({
          id: order.id,
          orderNo: order.orderNo,
          styleName: order.styleName ?? "",
          quantity: Number(quantity),
          fields: {
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
          },
        }));
        requestOrderId = selectedOrders[0].order.id;
        requestOrderNo = input.bulkOrders
          ? `BULK: ${selectedOrders.length} ORDERS`
          : selectedOrders[0].order.orderNo;
      }
    }

    const requestedLabelCount = requestItems.reduce((total, item) => total + item.quantity, 0);
    if (
      requestItems.length === 0
      || requestItems.some(({ quantity }) => !Number.isSafeInteger(quantity) || quantity < 1)
      || !Number.isSafeInteger(requestedLabelCount)
      || requestedLabelCount > MAX_ORDER_QR_PRINT_REQUEST_LABELS
    ) {
      return { success: false as const, reason: "INVALID_QUANTITY" as const };
    }

    const template = await transaction.merchandisingOrderQrTemplate.findFirst({
      where: {
        organization_id: organizationId,
        id: input.templateId,
        type: isFinishedGoodsBarcodeRequest
          ? "FG_BARCODE"
          : sourceType === "POS_PURCHASE_BILL" ? "POS_ITEM_BARCODE" : "ORDER_TAGS",
      },
      select: {
        name: true,
        type: true,
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

    const legacyFieldKeys = normalizeTemplateFields(template.field_keys);
    const qrFieldKey = isOrderQrTemplateFieldKey(template.qr_field_key)
      ? template.qr_field_key
      : legacyFieldKeys[0] ?? "orderNo";
    const displayFields = normalizeTemplateFields(template.display_fields ?? legacyFieldKeys);
    const design = parseStoredOrderQrTemplateDesign(
      template.display_field_styles,
      displayFields,
    );
    if (!design.pageSetup) {
      return { success: false as const, reason: "PAGE_SETUP_REQUIRED" as const };
    }
    const { displayFieldStyles, layout } = design;
    const bulkSnapshots = requestItems.map((item) => {
      const displayValues = Object.fromEntries(displayFields.flatMap((key) => {
        const value = item.fields[key];
        return value === null || value === undefined || String(value).trim() === ""
          ? []
          : [[key, String(value)]];
      }));
      const qrContent = buildRequestQrPayload([qrFieldKey], item.fields);
      return {
        orderId: item.id,
        orderNo: item.orderNo,
        styleName: item.styleName,
        quantity: item.quantity,
        qrPayload: qrContent.payload,
        displayValues,
      };
    });
    const displayValues = bulkSnapshots[0].displayValues;
    if (bulkSnapshots.some((item) => !item.qrPayload)) {
      return { success: false as const, reason: "QR_FIELD_VALUE_MISSING" as const };
    }
    const qrPayload = bulkSnapshots.length > 1
      ? JSON.stringify(bulkSnapshots.map(({ orderNo, qrPayload }) => ({ orderNo, qrPayload })))
      : bulkSnapshots[0].qrPayload;
    const shouldStoreBulkItems = isFinishedGoodsBarcodeRequest
      || sourceType === "POS_PURCHASE_BILL"
      || bulkSnapshots.length > 1;

    const request = await transaction.merchandisingOrderQrPrintRequest.create({
      data: {
        organization_id: organizationId,
        source_type: sourceType,
        order_id: requestOrderId,
        purchase_bill_id: requestPurchaseBillId,
        order_no: requestOrderNo,
        request_type: input.requestType,
        template_name: template?.name ?? null,
        field_keys: [...new Set([qrFieldKey, ...displayFields])],
        qr_field_key: qrFieldKey,
        display_fields: displayFields,
        display_values: {
          ...displayValues,
          __printQuantity: requestedLabelCount,
          __pageSetup: design.pageSetup,
          ...(shouldStoreBulkItems
            ? {
              __displayFields: displayFields,
              __bulkItems: bulkSnapshots,
              ...(isFinishedGoodsBarcodeRequest ? { __finishedGoodsBarcode: true } : {}),
            }
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
        source_type: true,
        order_id: true,
        purchase_bill_id: true,
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
        source_type: true,
        order_id: true,
        purchase_bill_id: true,
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
