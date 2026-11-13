"use client";

import { useEffect, useState, startTransition, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { QrCode } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { ReportGrid, type FilterOperator } from "@/components/reports/report-grid-display";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import {
  ORDER_QR_TEMPLATE_SIZES,
  ORDER_QR_TEMPLATE_TYPES,
  buildOrderQrPayload,
  getQrTemplateFieldLabel,
  getQrTemplateFields,
  getQrTemplateSampleValues,
  parseOrderQrTemplateLayout,
  parseStoredOrderQrTemplateDesign,
  type OrderQrTemplateType,
  type QrTemplateFieldKey,
  type OrderQrTemplateLayout,
  type OrderQrDisplayFieldStyle,
} from "@/lib/services/orders/order-qr-template-contract";
import {
  MAX_ORDER_QR_PRINT_REQUEST_ORDERS,
  MAX_ORDER_QR_PRINT_REQUEST_LABELS,
} from "@/lib/services/orders/order-qr-print-request-contract";
import { normalizeUppercase } from "@/lib/utilities/text-case";

const OrderQrStickerPreview = dynamic(
  () => import("@/components/erp/order-qr-sticker-preview"),
  { ssr: false },
);
const ArticleBasedOrderDialog = dynamic(
  () => import("@/components/erp/article-based-order-dialog"),
  { ssr: false },
);
const MerchandisingOrderVariantDialog = dynamic(
  () => import("@/components/erp/merchandising-order-variant-dialog"),
  { ssr: false },
);

type OrderRecord = {
  id: string;
  orderNo: string;
  entityName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  season?: string | null;
  article?: string | null;
  articleCode?: string | null;
  variantCode?: string | null;
  styleName?: string | null;
  colors?: string | null;
  buyer?: string | null;
  brand?: string | null;
  sizeGroup?: string | null;
  orderQty?: number | null;
  deliveryDate?: string | null;
  finalStatus: string;
  processStatus?: string | null;
  sourceStatus?: string | null;
};

type OrderQrTemplate = {
  id: string;
  name: string;
  type: OrderQrTemplateType;
  qrFieldKey: QrTemplateFieldKey;
  displayFields: QrTemplateFieldKey[];
  displayFieldStyles: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  qrSize: number;
  stickerWidthMm: number;
  stickerLengthMm: number;
};

type FinishedGoodsQrRow = {
  finishedGoodsId: string;
  size: string | null;
  buyerSize: string | null;
  skuCode: string | null;
  barcode: string | null;
  totalQty: number | null;
};

type FinishedGoodsQrOrder = {
  orderId: string;
  orderNo: string;
  styleName: string | null;
  finishedGoodsRows: FinishedGoodsQrRow[];
};

function parseOrderQrTemplates(value: unknown): OrderQrTemplate[] {
  if (!Array.isArray(value)) throw new Error("QR template response was invalid.");
  const templates = value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.type !== "string"
      || !ORDER_QR_TEMPLATE_TYPES.includes(candidate.type as OrderQrTemplateType)
    ) return [];
    const type = candidate.type as OrderQrTemplateType;
    const allowedFields = getQrTemplateFields(type);
    const displayFields = Array.isArray(candidate.displayFields)
      ? candidate.displayFields.filter((field): field is QrTemplateFieldKey =>
        allowedFields.some((option) => option.key === field))
      : [];
    const layout = parseOrderQrTemplateLayout(candidate.layout, displayFields);
    if (
      typeof candidate.id !== "string"
      || typeof candidate.name !== "string"
      || typeof candidate.qrFieldKey !== "string"
      || !allowedFields.some((field) => field.key === candidate.qrFieldKey)
      || !Array.isArray(candidate.displayFields)
      || displayFields.length !== candidate.displayFields.length
      || !layout.success
      || typeof candidate.qrSize !== "number"
      || !ORDER_QR_TEMPLATE_SIZES.includes(
        candidate.qrSize as (typeof ORDER_QR_TEMPLATE_SIZES)[number],
      )
      || typeof candidate.stickerWidthMm !== "number"
      || typeof candidate.stickerLengthMm !== "number"
      || !Number.isFinite(candidate.stickerWidthMm)
      || !Number.isFinite(candidate.stickerLengthMm)
      || candidate.stickerWidthMm <= 0
      || candidate.stickerLengthMm <= 0
    ) return [];
    const design = parseStoredOrderQrTemplateDesign({
      styles: candidate.displayFieldStyles,
      layout: candidate.layout,
    }, displayFields);
    return [{
      id: candidate.id,
      name: candidate.name,
      type,
      qrFieldKey: candidate.qrFieldKey as QrTemplateFieldKey,
      displayFields,
      displayFieldStyles: design.displayFieldStyles,
      layout: layout.data,
      qrSize: candidate.qrSize,
      stickerWidthMm: candidate.stickerWidthMm,
      stickerLengthMm: candidate.stickerLengthMm,
    }];
  });
  if (templates.length !== value.length) {
    throw new Error("One or more QR templates could not be loaded. Review the saved templates and try again.");
  }
  return templates;
}

function parseFinishedGoodsQrOrders(value: unknown): FinishedGoodsQrOrder[] {
  if (!Array.isArray(value)) throw new Error("Finished-goods response was invalid.");
  return value.map((item) => {
    if (
      typeof item !== "object"
      || item === null
      || Array.isArray(item)
    ) {
      throw new Error("Finished-goods response was invalid.");
    }
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.orderId !== "string"
      || typeof candidate.orderNo !== "string"
      || !(typeof candidate.styleName === "string" || candidate.styleName === null)
      || !Array.isArray(candidate.finishedGoodsRows)
    ) {
      throw new Error("Finished-goods response was invalid.");
    }
    const finishedGoodsRows = candidate.finishedGoodsRows.map((row) => {
      if (
        typeof row !== "object"
        || row === null
        || Array.isArray(row)
      ) {
        throw new Error("Finished-goods size details were invalid.");
      }
      const sizeRow = row as Record<string, unknown>;
      if (
        typeof sizeRow.finishedGoodsId !== "string"
        || !(typeof sizeRow.size === "string" || sizeRow.size === null)
        || !(typeof sizeRow.buyerSize === "string" || sizeRow.buyerSize === null)
        || !(typeof sizeRow.skuCode === "string" || sizeRow.skuCode === null)
        || !(typeof sizeRow.barcode === "string" || sizeRow.barcode === null)
        || !(sizeRow.totalQty === null || (typeof sizeRow.totalQty === "number" && Number.isSafeInteger(sizeRow.totalQty)))
      ) {
        throw new Error("Finished-goods size details were invalid.");
      }
      return {
        finishedGoodsId: sizeRow.finishedGoodsId,
        size: sizeRow.size,
        buyerSize: sizeRow.buyerSize,
        skuCode: sizeRow.skuCode,
        barcode: sizeRow.barcode,
        totalQty: sizeRow.totalQty,
      };
    });
    return {
      orderId: candidate.orderId,
      orderNo: candidate.orderNo,
      styleName: candidate.styleName,
      finishedGoodsRows,
    };
  });
}

function getOrderQrFieldValues(order: OrderRecord, quantity: number) {
  return {
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
    deliveryDate: order.deliveryDate,
  } satisfies Partial<Record<QrTemplateFieldKey, string | number | null>>;
}

type FilterableOrderField =
  | "orderNo"
  | "entityName"
  | "category"
  | "subCategory"
  | "season"
  | "article"
  | "articleCode"
  | "variantCode"
  | "styleName"
  | "colors"
  | "buyer"
  | "brand"
  | "sizeGroup"
  | "orderQty"
  | "deliveryDate"
  | "processStatus"
  | "finalStatus"
  | "sourceStatus";

const reportFilterFields: Array<{
  key: FilterableOrderField;
  label: string;
  filterOperators?: FilterOperator[];
}> = [
  { key: "orderNo", label: "Order No" },
  { key: "entityName", label: "Entity Name" },
  { key: "category", label: "Product Category" },
  { key: "subCategory", label: "Product Sub Category" },
  { key: "season", label: "Season" },
  { key: "articleCode", label: "Article Code" },
  { key: "variantCode", label: "Variant Code" },
  { key: "article", label: "Article Name" },
  { key: "styleName", label: "Style Name" },
  { key: "colors", label: "Colors" },
  { key: "buyer", label: "Buyer" },
  { key: "brand", label: "Brand" },
  { key: "sizeGroup", label: "Size Group" },
  { key: "orderQty", label: "Order Qty", filterOperators: ["is", "empty"] },
  { key: "deliveryDate", label: "Delivery Date" },
  { key: "processStatus", label: "Process Status" },
  { key: "finalStatus", label: "Final Status" },
  { key: "sourceStatus", label: "Source" },
];

const dsStatusOptions = [
  "Draft",
  "Waiting For Approval",
  "Approved",
  "Waiting For Production Schedule",
  "Work Order",
  "Shipped",
  "Closed",
] as const;

const ORDERS_PAGE_SIZE = 25;
function renderOrderCell(fieldKey: string, order: OrderRecord) {
  const value = order[fieldKey as keyof OrderRecord];
  if (fieldKey === "sourceStatus" && value === "DEMO") return "DUMMY DATA";
  if (value === null || value === undefined) return "";
  return normalizeUppercase(String(value));
}

function getOrderRowId(order: OrderRecord) {
  return order.id;
}

export default function MerchandisingOrdersPage({
  workspaceId,
  organizationId,
  initialPage,
}: {
  workspaceId: string;
  organizationId: string;
  initialPage: { orders: OrderRecord[]; nextCursor: string | null };
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRecord[]>(initialPage.orders);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryCursor, setRetryCursor] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] =
    useState<(typeof dsStatusOptions)[number]>("Draft");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [orderColumnFilters, setOrderColumnFilters] = useState<Record<string, {
    operator: "contains" | "is" | "notContains" | "empty";
    value: string;
  }>>({});

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showBulkQrRequest, setShowBulkQrRequest] = useState(false);
  const [bulkQrQuantityMode, setBulkQrQuantityMode] = useState<"PCS" | "BULK_QTY">("PCS");
  const [bulkQrQuantities, setBulkQrQuantities] = useState<Record<string, string>>({});
  const [finishedGoodsQrOrders, setFinishedGoodsQrOrders] = useState<FinishedGoodsQrOrder[]>([]);
  const [finishedGoodsQrQuantities, setFinishedGoodsQrQuantities] = useState<Record<string, string>>({});
  const [isLoadingFinishedGoodsQrRows, setIsLoadingFinishedGoodsQrRows] = useState(false);
  const [finishedGoodsQrRowsError, setFinishedGoodsQrRowsError] = useState("");
  const [finishedGoodsQrRowsRetry, setFinishedGoodsQrRowsRetry] = useState(0);
  const [finishedGoodsQrRowsLoadedKey, setFinishedGoodsQrRowsLoadedKey] = useState("");
  const [qrTemplates, setQrTemplates] = useState<OrderQrTemplate[]>([]);
  const [bulkQrTemplateType, setBulkQrTemplateType] = useState<"ORDER_TAGS" | "FG_BARCODE">("ORDER_TAGS");
  const [selectedQrTemplateId, setSelectedQrTemplateId] = useState("");
  const [isLoadingQrTemplates, setIsLoadingQrTemplates] = useState(false);
  const [qrTemplateError, setQrTemplateError] = useState("");
  const [qrTemplateRetry, setQrTemplateRetry] = useState(0);
  const [qrRequestError, setQrRequestError] = useState("");
  const [qrRequestSuccess, setQrRequestSuccess] = useState("");
  const [isSubmittingQrRequest, setIsSubmittingQrRequest] = useState(false);
  const [sampleQrPreview, setSampleQrPreview] = useState<{ key: string; dataUrl: string } | null>(null);
  const [sampleQrPreviewError, setSampleQrPreviewError] = useState<{ key: string; error: string } | null>(null);
  const [isPreparingBulkWorkbook, setIsPreparingBulkWorkbook] = useState(false);
  const [bulkWorkbookError, setBulkWorkbookError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [showArticleOrderDialog, setShowArticleOrderDialog] = useState(false);
  const [articleOrderSuccess, setArticleOrderSuccess] = useState("");
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [isLoadingVariant, setIsLoadingVariant] = useState(false);
  const [isCreatingVariant, setIsCreatingVariant] = useState(false);
  const [variantLoadError, setVariantLoadError] = useState("");
  const [variantCreateError, setVariantCreateError] = useState("");
  const [variantSuccessMessage, setVariantSuccessMessage] = useState("");
  const [variantTargetOrderId, setVariantTargetOrderId] = useState<string | null>(null);
  const [variantPreparedToken, setVariantPreparedToken] = useState("");
  const [variantSourceOrderNo, setVariantSourceOrderNo] = useState("");
  const [variantSizeGroup, setVariantSizeGroup] = useState("");
  const [variantRows, setVariantRows] = useState<Array<{ size: string; qty: string }>>([]);
  const variantLoadSequence = useRef(0);
  const isCreatingVariantRef = useRef(false);
  const [variantDraft, setVariantDraft] = useState({
    styleName: "",
    colors: "",
  });
  const [visibleReportFields, setVisibleReportFields] = useState<FilterableOrderField[]>(
    reportFilterFields.map((field) => field.key),
  );
  const lastLoadedAt = useRef(0);
  const skipInitialStatusFetch = useRef(true);
  const latestOrderRequest = useRef<AbortController | null>(null);

  const selectedQrOrders = useMemo(
    () => selectedOrderIds.flatMap((id) => {
      const order = orders.find((candidate) => candidate.id === id);
      return order ? [order] : [];
    }),
    [orders, selectedOrderIds],
  );
  const selectedQrTemplate = qrTemplates.find((template) => template.id === selectedQrTemplateId);
  const bulkQrTemplates = qrTemplates.filter((template) => template.type === bulkQrTemplateType);
  const finishedGoodsQrSelectionKey = selectedOrderIds.join("|");
  const selectedFinishedGoodsQrRows = finishedGoodsQrOrders.flatMap((order) =>
    order.finishedGoodsRows.map((row) => ({
      ...row,
      orderId: order.orderId,
      orderNo: order.orderNo,
      styleName: order.styleName,
    })),
  );
  const sampleQrOrder = selectedQrOrders[0];
  const sampleQrQuantity = sampleQrOrder
    ? bulkQrQuantityMode === "PCS"
      ? 1
      : Number(bulkQrQuantities[sampleQrOrder.id] ?? sampleQrOrder.orderQty ?? 1)
    : 1;
  const sampleQrFields: Partial<Record<QrTemplateFieldKey, string | number | null>> =
    selectedQrTemplate?.type === "FG_BARCODE"
      ? getQrTemplateSampleValues("FG_BARCODE")
      : sampleQrOrder ? getOrderQrFieldValues(sampleQrOrder, sampleQrQuantity) : {};
  const sampleQrPayload = selectedQrTemplate
    ? buildOrderQrPayload([selectedQrTemplate.qrFieldKey], sampleQrFields).payload
    : "";
  const sampleQrPreviewKey = `${selectedQrTemplateId}:${sampleQrPayload}`;
  const sampleQrDataUrl = sampleQrPreview?.key === sampleQrPreviewKey
    ? sampleQrPreview.dataUrl
    : "";
  const sampleQrError = sampleQrPreviewError?.key === sampleQrPreviewKey
    ? sampleQrPreviewError.error
    : "";
  const sampleQrDisplayFields = selectedQrTemplate?.displayFields.map((key) => {
    const value = sampleQrFields[key];
    return {
      key,
      label: getQrTemplateFieldLabel(key),
      value: value === null || value === undefined ? "" : String(value),
      style: selectedQrTemplate.displayFieldStyles[key],
    };
  }) ?? [];
  const bulkQrLabelTotal = selectedQrOrders.reduce((total, order) => {
    const quantity = Number(bulkQrQuantities[order.id]);
    return total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
  const finishedGoodsQrLabelTotal = selectedFinishedGoodsQrRows.reduce((total, row) => {
    if (bulkQrQuantityMode === "PCS") return total + 1;
    const quantity = Number(finishedGoodsQrQuantities[row.finishedGoodsId]);
    return total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);

  const loadOrders = useCallback(async (
    signal?: AbortSignal,
    force = false,
    cursor?: string,
    append = false,
  ) => {
    const now = Date.now();
    if (!cursor && !force && now - lastLoadedAt.current < 1500) return;
    if (!cursor) lastLoadedAt.current = now;
    setLoadError("");
    setRetryCursor(cursor ?? null);
    if (append) setIsLoadingMore(true);
    else {
      setIsLoadingOrders(true);
      setIsLoadingMore(false);
    }
    if (signal?.aborted) return;
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    signal?.addEventListener("abort", abortRequest, { once: true });
    latestOrderRequest.current?.abort();
    latestOrderRequest.current = requestController;
    const requestSignal = requestController.signal;

    try {
      const query = new URLSearchParams({
        organizationId,
        limit: String(ORDERS_PAGE_SIZE),
        status: selectedStatus,
      });
      if (debouncedSearchQuery) query.set("search", debouncedSearchQuery);
      if (Object.keys(orderColumnFilters).length > 0) {
        query.set("filters", JSON.stringify(orderColumnFilters));
      }
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/orders?${query.toString()}`, {
        cache: "no-store",
        signal: requestSignal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/json")) {
        throw new Error(`Orders request failed: ${response.status} ${response.statusText} (${contentType || "non-json"})`);
      }
      const data = await response.json();
      if (!Array.isArray(data?.orders)) throw new Error("Orders response was invalid.");
      setOrders((current) => append ? [...current, ...data.orders] : data.orders);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Unable to load orders", error);
      setLoadError(error instanceof Error ? error.message : "Unable to load orders.");
    }
    finally {
      signal?.removeEventListener("abort", abortRequest);
      const isCurrentRequest = latestOrderRequest.current === requestController;
      if (isCurrentRequest) latestOrderRequest.current = null;
      if (!isCurrentRequest) return;
      if (requestSignal.aborted) {
        if (append) setIsLoadingMore(false);
        else setIsLoadingOrders(false);
        return;
      }
      if (append) setIsLoadingMore(false);
      else setIsLoadingOrders(false);
    }
  }, [debouncedSearchQuery, orderColumnFilters, organizationId, selectedStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    if (skipInitialStatusFetch.current) {
      skipInitialStatusFetch.current = false;
      lastLoadedAt.current = Date.now();
    } else {
      void loadOrders(controller.signal, true);
    }
    const handleFocus = () => {
      void loadOrders(undefined, false);
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      controller.abort();
      latestOrderRequest.current?.abort();
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadOrders]);

  useEffect(() => {
    if (!showBulkQrRequest) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      organizationId,
      workspaceId,
    });
    void (async () => {
      setIsLoadingQrTemplates(true);
      setQrTemplateError("");
      try {
        const response = await fetch(`/api/orders/qr-templates?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const errorMessage = typeof data === "object" && data !== null
            && "error" in data && typeof data.error === "string"
            ? data.error
            : "Unable to load QR templates.";
          throw new Error(errorMessage);
        }
        const payload = typeof data === "object" && data !== null ? data : {};
        const templates = parseOrderQrTemplates(
          "templates" in payload ? payload.templates : undefined,
        );
        if (controller.signal.aborted) return;
        setQrTemplates(templates);
        setSelectedQrTemplateId((current) =>
          templates.some((template) => template.id === current && template.type === "ORDER_TAGS")
            ? current
            : templates.find((template) => template.type === "ORDER_TAGS")?.id ?? "",
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setQrTemplateError(error instanceof Error ? error.message : "Unable to load QR templates.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingQrTemplates(false);
      }
    })();
    return () => controller.abort();
  }, [organizationId, qrTemplateRetry, showBulkQrRequest, workspaceId]);

  useEffect(() => {
    if (
      !showBulkQrRequest
      || bulkQrTemplateType !== "FG_BARCODE"
      || selectedOrderIds.length === 0
      || finishedGoodsQrRowsLoadedKey === finishedGoodsQrSelectionKey
    ) return;
    const controller = new AbortController();
    void (async () => {
      setIsLoadingFinishedGoodsQrRows(true);
      setFinishedGoodsQrRowsError("");
      try {
        const query = new URLSearchParams({ organizationId, workspaceId });
        for (const orderId of selectedOrderIds) query.append("orderId", orderId);
        const response = await fetch(`/api/orders/fg-barcode-rows?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const errorMessage = typeof data === "object" && data !== null
            && "error" in data && typeof data.error === "string"
            ? data.error
            : "Unable to load finished-goods sizes.";
          throw new Error(errorMessage);
        }
        const payload = typeof data === "object" && data !== null ? data : {};
        const rows = parseFinishedGoodsQrOrders(
          "orders" in payload ? payload.orders : undefined,
        );
        if (rows.length !== selectedOrderIds.length) {
          throw new Error("Finished-goods sizes were not returned for every selected order.");
        }
        if (controller.signal.aborted) return;
        setFinishedGoodsQrOrders(rows);
        setFinishedGoodsQrQuantities(Object.fromEntries(rows.flatMap((order) =>
          order.finishedGoodsRows.map((row) => [
            row.finishedGoodsId,
            row.totalQty === null ? "" : String(row.totalQty),
          ]),
        )));
        setFinishedGoodsQrRowsLoadedKey(finishedGoodsQrSelectionKey);
      } catch (error) {
        if (!controller.signal.aborted) {
          setFinishedGoodsQrRowsError(
            error instanceof Error ? error.message : "Unable to load finished-goods sizes.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingFinishedGoodsQrRows(false);
      }
    })();
    return () => controller.abort();
  }, [
    bulkQrTemplateType,
    finishedGoodsQrRowsLoadedKey,
    finishedGoodsQrSelectionKey,
    organizationId,
    selectedOrderIds,
    showBulkQrRequest,
    workspaceId,
    finishedGoodsQrRowsRetry,
  ]);

  useEffect(() => {
    let active = true;
    if (!showBulkQrRequest || !sampleQrPayload || !selectedQrTemplate) return;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(sampleQrPayload, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: selectedQrTemplate.qrSize,
      }))
      .then((dataUrl) => {
        if (active) setSampleQrPreview({ key: sampleQrPreviewKey, dataUrl });
      })
      .catch((error: unknown) => {
        if (active) {
          setSampleQrPreviewError({
            key: sampleQrPreviewKey,
            error: error instanceof Error ? error.message : "Unable to prepare the QR preview.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [sampleQrPayload, sampleQrPreviewKey, selectedQrTemplate, showBulkQrRequest]);

  const filteredOrders = orders;

  const loadMoreOrders = useCallback(() => {
    if (!nextCursor || isLoadingMore) return;
    void loadOrders(undefined, true, nextCursor, true);
  }, [isLoadingMore, loadOrders, nextCursor]);

  const handleSelectOrder = useCallback((orderId: string) => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${encodeURIComponent(orderId)}`,
      );
    });
  }, [organizationId, router, workspaceId]);

  const handleStatusChange = useCallback((status: string) => {
    setOrders([]);
    setNextCursor(null);
    setSelectedStatus(status as (typeof dsStatusOptions)[number]);
  }, []);

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleOrderColumnFiltersChange = useCallback((filters: Record<string, {
    operator: "contains" | "is" | "notContains" | "empty";
    value: string;
  }>) => {
    setOrderColumnFilters(filters);
  }, []);

  const handleToggleOrderSelection = useCallback((orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        if (current.includes(orderId)) return current;
        return [...current, orderId];
      }
      return current.filter((id) => id !== orderId);
    });
  }, []);

  const handleToggleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(filteredOrders.map((order) => order.id));
    } else {
      setSelectedOrderIds([]);
    }
  }, [filteredOrders]);

  const handleReportFieldsChange = useCallback((fields: (keyof OrderRecord | string)[]) => {
    setVisibleReportFields(fields as FilterableOrderField[]);
  }, []);

  const handleReportRowClick = useCallback((orderId: string) => {
    handleSelectOrder(orderId);
  }, [handleSelectOrder]);

  const handleOpenDeleteConfirmation = useCallback(() => {
    setDeleteError("");
    setShowDeleteConfirmation(true);
  }, []);

  const handleBulkUpload = useCallback(async () => {
    setBulkWorkbookError("");
    if (selectedOrderIds.length < 2) {
      setBulkWorkbookError("Select at least two orders to download the bulk upload workbook.");
      return;
    }

    const selectedOrders = selectedOrderIds
      .map((id) => orders.find((order) => order.id === id))
      .filter((order): order is OrderRecord => Boolean(order));
    if (selectedOrders.length !== selectedOrderIds.length) {
      setBulkWorkbookError("Some selected orders are no longer available. Refresh the order list and try again.");
      return;
    }
    const sizeGroups = new Set(selectedOrders.map((order) => String(order.sizeGroup ?? "").trim().toLocaleLowerCase()));
    if (sizeGroups.size !== 1 || sizeGroups.has("")) {
      setBulkWorkbookError("Please select orders with the same Size Group.");
      return;
    }

    setIsPreparingBulkWorkbook(true);
    try {
      const query = new URLSearchParams({ workspaceId, organizationId });
      const response = await fetch(`/api/orders/bulk-upload-template?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedOrderIds }),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        const payload = contentType.includes("application/json") ? await response.json() : null;
        throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to download the selected-order workbook.");
      }

      const workbook = await response.blob();
      const downloadUrl = URL.createObjectURL(workbook);
      const downloadLink = document.createElement("a");
      downloadLink.href = downloadUrl;
      downloadLink.download = "selected-orders-bulk-upload-editable-v2.xlsx";
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      setBulkWorkbookError(error instanceof Error ? error.message : "Unable to download the selected-order workbook.");
    } finally {
      setIsPreparingBulkWorkbook(false);
    }
  }, [organizationId, orders, selectedOrderIds, workspaceId]);

  const handleNewOrder = useCallback(() => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/create`,
      );
    });
  }, [organizationId, router, workspaceId]);

  const openBulkQrRequest = useCallback(() => {
    setQrRequestError("");
    setBulkQrQuantityMode("PCS");
    setBulkQrTemplateType("ORDER_TAGS");
    setSelectedQrTemplateId(qrTemplates.find((template) => template.type === "ORDER_TAGS")?.id ?? "");
    setFinishedGoodsQrOrders([]);
    setFinishedGoodsQrQuantities({});
    setIsLoadingFinishedGoodsQrRows(false);
    setFinishedGoodsQrRowsError("");
    setFinishedGoodsQrRowsLoadedKey("");
    setBulkQrQuantities(Object.fromEntries(selectedQrOrders.map((order) => [
      order.id,
      String(Math.max(1, Number(order.orderQty) || 1)),
    ])));
    setShowBulkQrRequest(true);
  }, [qrTemplates, selectedQrOrders]);

  const handleOpenArticleOrderDialog = useCallback(() => {
    setArticleOrderSuccess("");
    setShowArticleOrderDialog(true);
  }, []);

  const renderOrderReportCell = useCallback((fieldKey: string, order: OrderRecord) => {
    if (fieldKey === "orderNo") {
      return (
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${encodeURIComponent(order.id)}`}
          prefetch={false}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Open order ${order.orderNo}`}
          className="font-semibold text-[var(--erp-brand)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-brand)]"
        >
          {normalizeUppercase(order.orderNo)}
        </Link>
      );
    }
    return renderOrderCell(fieldKey, order);
  }, [organizationId, workspaceId]);

  const submitBulkQrRequest = async () => {
    setQrRequestError("");
    if (selectedOrderIds.length < 2) {
      setQrRequestError("Select at least two orders to create one consolidated QR request.");
      return;
    }
    if (selectedOrderIds.length === 0 || selectedQrOrders.length !== selectedOrderIds.length) {
      setQrRequestError("Some selected orders are no longer available. Refresh the orders list and try again.");
      return;
    }
    if (selectedQrOrders.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS) {
      setQrRequestError(
        `A single QR request can contain up to ${MAX_ORDER_QR_PRINT_REQUEST_ORDERS} orders. Reduce the selection and try again.`,
      );
      return;
    }
    if (!selectedQrTemplateId) {
      setQrRequestError("Create or select a QR template before requesting labels.");
      return;
    }
    const isFinishedGoodsRequest = selectedQrTemplate?.type === "FG_BARCODE";
    let finishedGoodsItems: Array<{ orderId: string; finishedGoodsId: string; quantity: number }> = [];
    const bulkOrders = isFinishedGoodsRequest ? [] : selectedQrOrders.map((order) => ({
      orderId: order.id,
      quantity: bulkQrQuantityMode === "PCS" ? 1 : Number(bulkQrQuantities[order.id]),
    }));
    if (isFinishedGoodsRequest) {
      if (
        isLoadingFinishedGoodsQrRows
        || finishedGoodsQrRowsError
        || finishedGoodsQrRowsLoadedKey !== finishedGoodsQrSelectionKey
      ) {
        setQrRequestError("Wait for the selected orders' finished-goods sizes to load before requesting labels.");
        return;
      }
      if (
        finishedGoodsQrOrders.length !== selectedQrOrders.length
        || finishedGoodsQrOrders.some((order) => order.finishedGoodsRows.length === 0)
        || selectedFinishedGoodsQrRows.length === 0
      ) {
        setQrRequestError("Every selected order must have at least one saved finished-goods size.");
        return;
      }
      if (selectedFinishedGoodsQrRows.some((row) =>
        !row.skuCode?.trim() || !row.barcode?.trim()
      )) {
        setQrRequestError("Every selected finished-goods size needs its assigned SKU and barcode before labels can be requested.");
        return;
      }
      finishedGoodsItems = selectedFinishedGoodsQrRows.map((row) => ({
        orderId: row.orderId,
        finishedGoodsId: row.finishedGoodsId,
        quantity: bulkQrQuantityMode === "PCS"
          ? 1
          : Number(finishedGoodsQrQuantities[row.finishedGoodsId]),
      }));
      if (finishedGoodsItems.some(({ quantity }) =>
        !Number.isSafeInteger(quantity) || quantity < 1
      )) {
        setQrRequestError("Enter a positive whole-number label quantity for every finished-goods size.");
        return;
      }
      if (finishedGoodsItems.reduce((total, item) => total + item.quantity, 0) > MAX_ORDER_QR_PRINT_REQUEST_LABELS) {
        setQrRequestError(
          `A single QR request cannot exceed ${MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()} labels.`,
        );
        return;
      }
    } else {
      if (bulkOrders.some(({ quantity }) => !Number.isSafeInteger(quantity) || quantity < 1)) {
        setQrRequestError("Enter a positive whole-number quantity for every selected order.");
        return;
      }
      if (bulkOrders.reduce((total, item) => total + item.quantity, 0) > MAX_ORDER_QR_PRINT_REQUEST_LABELS) {
        setQrRequestError(
          `A single QR request cannot exceed ${MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()} labels.`,
        );
        return;
      }
    }

    setIsSubmittingQrRequest(true);
    try {
      const query = new URLSearchParams({ organizationId, workspaceId });
      const response = await fetch(`/api/orders/qr-print-requests?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isFinishedGoodsRequest
            ? { finishedGoodsItems, quantityMode: bulkQrQuantityMode }
            : { bulkOrders, quantityMode: bulkQrQuantityMode }),
          templateId: selectedQrTemplateId,
          requestType: "PRINT",
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = typeof data === "object" && data !== null
          && "error" in data && typeof data.error === "string"
          ? data.error
          : "Unable to send the QR request.";
        throw new Error(errorMessage);
      }
      setShowBulkQrRequest(false);
      setSelectedOrderIds([]);
      setQrRequestSuccess(
        `One ${isFinishedGoodsRequest ? "FG Barcode" : "QR"} print request for ${selectedQrOrders.length} orders was sent to Design & Development.`,
      );
    } catch (error) {
      setQrRequestError(error instanceof Error ? error.message : "Unable to send the QR request.");
    } finally {
      setIsSubmittingQrRequest(false);
    }
  };

  const handleVariantOrder = useCallback(async (orderId: string) => {
    if (isCreatingVariantRef.current) return;
    setVariantSuccessMessage("");
    setVariantCreateError("");
    const loadSequence = ++variantLoadSequence.current;
    const sourceOrder = orders.find((order) => order.id === orderId);
    const sourceSizeGroup = String(sourceOrder?.sizeGroup ?? "").trim();
    setVariantTargetOrderId(orderId);
    setVariantPreparedToken("");
    setVariantSourceOrderNo(sourceOrder?.orderNo ?? "");
    setVariantSizeGroup(sourceSizeGroup);
    setVariantRows([]);
    setVariantDraft({ styleName: "", colors: "" });
    setVariantLoadError("");
    setVariantCreateError("");
    setIsLoadingVariant(true);
    setShowVariantDialog(true);

    try {
      if (!sourceOrder) {
        throw new Error("The source order is no longer available. Refresh the orders list and try again.");
      }
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/variant?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to prepare the source order for a variant.");
      }

      const mappedSizes: unknown[] = Array.isArray(data?.sizes) ? data.sizes : [];
      const seenSizes = new Set<string>();
      const mappedSizeRows = mappedSizes.flatMap((size) => {
        if (typeof size !== "string") return [];
        const normalizedSize = size.trim();
        if (!normalizedSize || seenSizes.has(normalizedSize)) return [];
        seenSizes.add(normalizedSize);
        return [{ size: normalizedSize, qty: "" }];
      });
      if (mappedSizeRows.length === 0) {
        throw new Error("The source order has no finished-goods sizes or mapped Size Group sizes to create a variant from.");
      }

      if (variantLoadSequence.current !== loadSequence) return;
      if (typeof data?.preparedToken !== "string" || !data.preparedToken) {
        throw new Error("Unable to prepare the source order. Please try again.");
      }
      setVariantPreparedToken(data.preparedToken);
      setVariantRows((currentRows) => {
        const quantitiesBySize = new Map(currentRows.map((row) => [row.size, row.qty]));
        return mappedSizeRows.map((row) => ({ ...row, qty: quantitiesBySize.get(row.size) ?? row.qty }));
      });
    } catch (error) {
      if (variantLoadSequence.current === loadSequence) {
        setVariantLoadError(error instanceof Error ? error.message : "Unable to load order for creating a variant.");
      }
    } finally {
      if (variantLoadSequence.current === loadSequence) {
        setIsLoadingVariant(false);
      }
    }
  }, [organizationId, orders]);

  const closeVariantDialog = () => {
    if (isCreatingVariantRef.current) return;
    variantLoadSequence.current += 1;
    setIsLoadingVariant(false);
    setShowVariantDialog(false);
  };

  const handleConfirmVariant = async () => {
    if (!variantTargetOrderId || isCreatingVariantRef.current) return;

    const styleName = variantDraft.styleName.trim();
    const colors = variantDraft.colors.trim();

    if (!styleName || !colors) {
      setVariantCreateError("Please enter style name and colour before creating the order.");
      return;
    }

    const cleanedRows = variantRows
      .map((row) => ({ size: row.size, qty: String(row.qty ?? "").trim() }))
      .filter((row) => row.size && row.qty !== "");

    if (cleanedRows.length === 0 || !cleanedRows.some((row) => Number(row.qty) > 0)) {
      setVariantCreateError("Enter a quantity greater than zero for at least one size.");
      return;
    }

    const invalidRow = cleanedRows.find((row) => !Number.isSafeInteger(Number(row.qty)) || Number(row.qty) < 0);
    if (invalidRow) {
      setVariantCreateError(`Quantity for size ${invalidRow.size} must be a non-negative whole number.`);
      return;
    }

    isCreatingVariantRef.current = true;
    setIsCreatingVariant(true);
    setVariantCreateError("");
    setVariantSuccessMessage("");
    variantLoadSequence.current += 1;
    setShowVariantDialog(false);
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(variantTargetOrderId)}/variant?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preparedToken: variantPreparedToken, styleName, colors, rows: cleanedRows }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to create order variant.");

      setVariantSuccessMessage("Your order has been created.");
      void loadOrders(undefined, true);
    } catch (error) {
      setVariantCreateError(error instanceof Error ? error.message : "Unable to create order variant.");
    } finally {
      isCreatingVariantRef.current = false;
      setIsCreatingVariant(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedOrderIds.length === 0) return;

    try {
      setIsDeleting(true);
      setDeleteError("");
      const response = await fetch(`/api/orders?organizationId=${encodeURIComponent(organizationId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedOrderIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to delete selected orders.");
      setOrders((current) => current.filter((order) => !selectedOrderIds.includes(order.id)));
      setSelectedOrderIds([]);
      setShowDeleteConfirmation(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete selected orders.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3 text-[11px]">
      <Card className="p-3 shadow-none border-slate-200">
        {loadError && (
          <div role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            Unable to load orders: {loadError}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 font-semibold underline"
              onClick={() => void loadOrders(undefined, true, retryCursor ?? undefined, Boolean(retryCursor))}
            >
              Retry
            </Button>
          </div>
        )}
        {isLoadingOrders && orders.length === 0 && (
          <p role="status" className="mb-3 text-xs text-slate-500">Loading orders...</p>
        )}
        {isCreatingVariant && (
          <p role="status" className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
            Creating your order in the background...
          </p>
        )}
        {variantSuccessMessage && (
          <p role="status" className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            {variantSuccessMessage}
          </p>
        )}
        {qrRequestSuccess && (
          <p role="status" className="mb-3 rounded-md border border-[var(--erp-success)] bg-[var(--erp-surface)] px-3 py-2 text-xs font-medium text-[var(--erp-success)]">
            {qrRequestSuccess}
          </p>
        )}
        {articleOrderSuccess && (
          <p role="status" className="mb-3 rounded-md border border-[var(--erp-success)] bg-[var(--erp-surface)] px-3 py-2 text-xs font-medium text-[var(--erp-success)]">
            {articleOrderSuccess}
          </p>
        )}
        {variantCreateError && !showVariantDialog && (
          <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            Order creation failed: {variantCreateError}
          </p>
        )}
        {bulkWorkbookError && (
          <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {bulkWorkbookError}
          </p>
        )}
        <ReportGrid
          title="Orders List"
          records={filteredOrders}
          fields={reportFilterFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={handleReportFieldsChange}
          isLoading={isLoadingOrders}
          storageKey={`credence-craft-orders-${organizationId}`}
          rowIdSelector={getOrderRowId}
          selectedIds={selectedOrderIds}
          onRowClick={handleReportRowClick}
          onToggleSelectAll={handleToggleSelectAll}
          onToggleRowSelection={handleToggleOrderSelection}
          statusOptions={dsStatusOptions}
          selectedStatus={selectedStatus}
          onStatusChange={handleStatusChange}
          serverSideSearch
          serverSideFilters
          searchMinLength={2}
          onSearchQueryChange={handleSearchQueryChange}
          onColumnFiltersChange={handleOrderColumnFiltersChange}
          onNewOrder={handleNewOrder}
          toolbarActions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={openBulkQrRequest}
                disabled={selectedOrderIds.length < 2 || isSubmittingQrRequest}
                aria-label={`Request QR labels for ${selectedOrderIds.length} selected orders`}
              >
                <QrCode aria-hidden="true" className="mr-1.5 h-4 w-4" />
                QR Labels{selectedOrderIds.length > 0 ? ` (${selectedOrderIds.length})` : ""}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={handleOpenArticleOrderDialog}
              >
                Create Order from Article
              </Button>
            </div>
          )}
          onDeleteSelected={handleOpenDeleteConfirmation}
          onBulkUpload={handleBulkUpload}
          bulkUploadLabel="Bulk Upload"
          bulkUploadDisabled={isPreparingBulkWorkbook}
          onRowAction={handleVariantOrder}
          rowActionLabel="Variant"
          renderCell={renderOrderReportCell}
        />
        {nextCursor && !loadError && (
          <div className="mt-3 flex justify-center">
            <Button type="button" variant="secondary" size="sm" onClick={loadMoreOrders} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading..." : "Load more orders"}
            </Button>
          </div>
        )}
      </Card>

      <Modal
        open={showBulkQrRequest}
        onClose={() => {
          if (!isSubmittingQrRequest) setShowBulkQrRequest(false);
        }}
        ariaLabelledBy="bulk-order-qr-title"
        size="rectangle"
        closeOnBackdrop={!isSubmittingQrRequest}
      >
        <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] min-h-0 flex-col p-6">
          <div className="mb-5 flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="bulk-order-qr-title" className="text-lg font-semibold text-[var(--erp-text)]">
                Request {bulkQrTemplateType === "FG_BARCODE" ? "FG Barcode" : "QR"} labels
              </h2>
              <p className="mt-1 text-sm text-[var(--erp-text-muted)]">
                One print request will be sent to Design & Development for {selectedOrderIds.length} selected orders.
              </p>
            </div>
            <span className="rounded-full border border-[var(--erp-border)] px-3 py-1 text-xs font-medium text-[var(--erp-text-muted)]">
              {selectedQrOrders.length} of {selectedOrderIds.length} orders available
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {qrTemplateError && (
              <div className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]" role="alert">
                <p>{qrTemplateError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => setQrTemplateRetry((retry) => retry + 1)}
                >
                  Retry templates
                </Button>
              </div>
            )}

            <Tabs
              ariaLabel="Barcode template type"
              compact
              value={bulkQrTemplateType}
              onChange={(value) => {
                if (value !== "ORDER_TAGS" && value !== "FG_BARCODE") return;
                setBulkQrTemplateType(value);
                setSelectedQrTemplateId(
                  qrTemplates.find((template) => template.type === value)?.id ?? "",
                );
              }}
              tabs={[
                { value: "ORDER_TAGS", label: "Order Tags" },
                { value: "FG_BARCODE", label: "FG Barcode" },
              ]}
            />

            <Select
              label="Saved QR template"
              value={selectedQrTemplateId}
              onChange={(event) => setSelectedQrTemplateId(event.target.value)}
              disabled={isLoadingQrTemplates || bulkQrTemplates.length === 0}
            >
              <option value="">
                {isLoadingQrTemplates ? "Loading templates..." : "Select a template"}
              </option>
              {bulkQrTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </Select>

            {!isLoadingQrTemplates && !qrTemplateError && bulkQrTemplates.length === 0 && (
              <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-text-muted)]">
                No saved {bulkQrTemplateType === "FG_BARCODE" ? "FG Barcode" : "Order Tags"} templates are available.{" "}
                <Link
                  href={`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates`}
                  className="font-semibold text-[var(--erp-brand)] underline-offset-2 hover:underline"
                >
                  Create a template
                </Link>
                .
              </p>
            )}

            {bulkQrTemplateType === "FG_BARCODE" ? (
              <>
                <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-text-muted)]">
                  Each row is a saved finished-goods size. PCS requests one label per size; Bulk Qty starts from the order quantity and can be changed without updating the order.
                </p>
                <Tabs
                  ariaLabel="FG barcode label quantity mode"
                  compact
                  value={bulkQrQuantityMode}
                  onChange={setBulkQrQuantityMode}
                  tabs={[
                    { value: "PCS", label: "PCS" },
                    { value: "BULK_QTY", label: "Bulk Qty" },
                  ]}
                />
                {isLoadingFinishedGoodsQrRows ? (
                  <p role="status" className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-text-muted)]">
                    Loading finished-goods sizes...
                  </p>
                ) : finishedGoodsQrRowsError ? (
                  <div className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]" role="alert">
                    <p>{finishedGoodsQrRowsError}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setFinishedGoodsQrRowsLoadedKey("");
                        setFinishedGoodsQrRowsRetry((retry) => retry + 1);
                      }}
                    >
                      Retry sizes
                    </Button>
                  </div>
                ) : selectedFinishedGoodsQrRows.length === 0 ? (
                  <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-text-muted)]">
                    No saved finished-goods sizes are available for the selected orders.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-right text-xs font-medium text-[var(--erp-text-muted)]">
                      Total labels: {finishedGoodsQrLabelTotal.toLocaleString()} / {MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()}
                    </p>
                    <Table className="max-h-56 overflow-y-auto">
                      <thead className="sticky top-0 bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-text-muted)]">
                        <tr>
                          <th scope="col" className="px-3 py-2">Order No</th>
                          <th scope="col" className="px-3 py-2">Style Name</th>
                          <th scope="col" className="px-3 py-2">Size</th>
                          <th scope="col" className="px-3 py-2">FG SKU</th>
                          <th scope="col" className="px-3 py-2">FG Barcode</th>
                          <th scope="col" className="px-3 py-2">Order Qty</th>
                          <th scope="col" className="w-36 px-3 py-2">Label Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--erp-border)]">
                        {selectedFinishedGoodsQrRows.map((row) => (
                          <tr key={row.finishedGoodsId}>
                            <td className="px-3 py-2 font-medium text-[var(--erp-text)]">{normalizeUppercase(row.orderNo)}</td>
                            <td className="px-3 py-2 text-[var(--erp-text-muted)]">{normalizeUppercase(row.styleName ?? "") || "—"}</td>
                            <td className="px-3 py-2 text-[var(--erp-text-muted)]">{normalizeUppercase(row.size ?? row.buyerSize ?? "") || "—"}</td>
                            <td className={`px-3 py-2 ${row.skuCode?.trim() ? "text-[var(--erp-text-muted)]" : "text-[var(--erp-danger)]"}`}>
                              {normalizeUppercase(row.skuCode ?? "") || "Missing"}
                            </td>
                            <td className={`px-3 py-2 ${row.barcode?.trim() ? "text-[var(--erp-text-muted)]" : "text-[var(--erp-danger)]"}`}>
                              {normalizeUppercase(row.barcode ?? "") || "Missing"}
                            </td>
                            <td className="px-3 py-2 text-[var(--erp-text-muted)]">
                              {row.totalQty === null ? "—" : row.totalQty.toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              {bulkQrQuantityMode === "PCS" ? (
                                <span className="text-[var(--erp-text)]">1</span>
                              ) : (
                                <Input
                                  aria-label={`Label quantity for ${row.orderNo} ${row.size ?? row.buyerSize ?? "size"}`}
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={MAX_ORDER_QR_PRINT_REQUEST_LABELS}
                                  step={1}
                                  value={finishedGoodsQrQuantities[row.finishedGoodsId] ?? ""}
                                  onChange={(event) => setFinishedGoodsQrQuantities((current) => ({
                                    ...current,
                                    [row.finishedGoodsId]: event.target.value,
                                  }))}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </>
            ) : (
            <>
            <Tabs
              ariaLabel="QR label quantity mode"
              compact
              value={bulkQrQuantityMode}
              onChange={setBulkQrQuantityMode}
              tabs={[
                { value: "PCS", label: "PCS" },
                { value: "BULK_QTY", label: "Bulk Qty" },
              ]}
            />

            {bulkQrQuantityMode === "PCS" ? (
            <Table className="max-h-56 overflow-y-auto">
              <thead className="sticky top-0 bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-text-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Order No</th>
                  <th scope="col" className="px-3 py-2">Style Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--erp-border)]">
                {selectedQrOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-3 py-2 font-medium text-[var(--erp-text)]">{normalizeUppercase(order.orderNo)}</td>
                    <td className="px-3 py-2 text-[var(--erp-text-muted)]">{normalizeUppercase(order.styleName ?? "") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            ) : (
            <div className="space-y-2">
              <p className="text-right text-xs font-medium text-[var(--erp-text-muted)]">
                Total labels: {bulkQrLabelTotal.toLocaleString()} / {MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()}
              </p>
              <Table className="max-h-56 overflow-y-auto">
                <thead className="sticky top-0 bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-text-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">Order No</th>
                    <th scope="col" className="px-3 py-2">Style Name</th>
                    <th scope="col" className="w-36 px-3 py-2">Label Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {selectedQrOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-3 py-2 font-medium text-[var(--erp-text)]">{normalizeUppercase(order.orderNo)}</td>
                      <td className="px-3 py-2 text-[var(--erp-text-muted)]">{normalizeUppercase(order.styleName ?? "") || "—"}</td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label={`Label quantity for ${order.orderNo}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_ORDER_QR_PRINT_REQUEST_LABELS}
                          step={1}
                          value={bulkQrQuantities[order.id] ?? ""}
                          onChange={(event) => setBulkQrQuantities((current) => ({
                            ...current,
                            [order.id]: event.target.value,
                          }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            )}
            </>
            )}

            {selectedQrTemplate && sampleQrOrder && (
            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--erp-text)]">Sample sticker preview</h3>
                <OrderQrStickerPreview
                  qrDataUrl={sampleQrDataUrl || undefined}
                  qrError={sampleQrError || undefined}
                  fields={sampleQrDisplayFields}
                  layout={selectedQrTemplate.layout}
                  stickerWidthMm={selectedQrTemplate.stickerWidthMm}
                  stickerLengthMm={selectedQrTemplate.stickerLengthMm}
                  className="max-w-xl"
                />
              </div>
              <dl className="grid content-start gap-2 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">Template</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">{selectedQrTemplate.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">Sticker size</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">
                    {selectedQrTemplate.stickerWidthMm} × {selectedQrTemplate.stickerLengthMm} mm
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">Printer</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">
                    {selectedQrTemplate.layout.printerType === "LASER" ? "Laser / A4 PDF" : "Barcode sticker printer"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">QR field</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">
                    {getQrTemplateFieldLabel(selectedQrTemplate.qrFieldKey)}
                  </dd>
                </div>
              </dl>
            </div>
            )}

            {qrRequestError && (
              <p role="alert" className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
                {qrRequestError}
              </p>
            )}
            {selectedOrderIds.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS && (
              <p role="alert" className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
                Select no more than {MAX_ORDER_QR_PRINT_REQUEST_ORDERS} orders for one QR request.
              </p>
            )}
          </div>
          <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--erp-border)] bg-white pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowBulkQrRequest(false)}
              disabled={isSubmittingQrRequest}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitBulkQrRequest()}
              disabled={
                isSubmittingQrRequest
                || isLoadingQrTemplates
                || Boolean(qrTemplateError)
                || !selectedQrTemplateId
                || (
                  bulkQrTemplateType === "FG_BARCODE"
                  && (
                    isLoadingFinishedGoodsQrRows
                    || Boolean(finishedGoodsQrRowsError)
                    || finishedGoodsQrRowsLoadedKey !== finishedGoodsQrSelectionKey
                    || selectedFinishedGoodsQrRows.length === 0
                  )
                )
                || selectedOrderIds.length < 2
                || selectedOrderIds.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS
              }
            >
              {isSubmittingQrRequest ? "Sending request..." : "Send one print request"}
            </Button>
          </div>
        </div>
      </Modal>

      <ArticleBasedOrderDialog
        key={organizationId}
        open={showArticleOrderDialog}
        organizationId={organizationId}
        onClose={() => setShowArticleOrderDialog(false)}
        onCreated={(orderNumbers) => {
          setShowArticleOrderDialog(false);
          setArticleOrderSuccess(
            orderNumbers.length > 0
              ? `Created ${orderNumbers.length} Article order${orderNumbers.length === 1 ? "" : "s"}: ${orderNumbers.join(", ")}.`
              : "Article orders created successfully.",
          );
          void loadOrders(undefined, true);
        }}
      />

      <MerchandisingOrderVariantDialog
        open={showVariantDialog}
        isLoading={isLoadingVariant}
        isCreating={isCreatingVariant}
        loadError={variantLoadError}
        createError={variantCreateError}
        sourceOrderNo={variantSourceOrderNo}
        sizeGroup={variantSizeGroup}
        variantDraft={variantDraft}
        variantRows={variantRows}
        onDraftChange={(changes) => setVariantDraft((current) => ({ ...current, ...changes }))}
        onRowsChange={setVariantRows}
        onClose={closeVariantDialog}
        onConfirm={handleConfirmVariant}
      />

      {showDeleteConfirmation && (
        <Modal
          open={showDeleteConfirmation}
          onClose={() => {
            if (!isDeleting) setShowDeleteConfirmation(false);
          }}
          ariaLabelledBy="delete-orders-title"
          variant="danger"
          size="square"
          closeOnBackdrop={!isDeleting}
        >
          <div className="space-y-4 p-6">
            <div>
              <h3 id="delete-orders-title" className="text-base font-bold text-slate-900">Delete selected orders?</h3>
              <p className="mt-1 text-xs text-slate-500">This will permanently delete {selectedOrderIds.length} order{selectedOrderIds.length === 1 ? "" : "s"} and its finished goods and BOM records.</p>
            </div>
            {deleteError ? (
              <p role="alert" className="rounded-md border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-danger)]">
                {deleteError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirmation(false)} disabled={isDeleting}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={isDeleting}>{isDeleting ? "Deleting..." : "Delete Orders"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}