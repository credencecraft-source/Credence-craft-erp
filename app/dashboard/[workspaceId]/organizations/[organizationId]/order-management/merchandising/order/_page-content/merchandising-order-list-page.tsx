"use client";

import { useEffect, useState, startTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import ArticleBasedOrderDialog from "@/components/erp/article-based-order-dialog";
import MerchandisingOrderVariantDialog from "@/components/erp/merchandising-order-variant-dialog";
import { ReportGrid } from "@/components/reports/report-grid-display";

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
  { key: "orderQty", label: "Order Qty" },
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
  if (fieldKey === "sourceStatus" && value === "DEMO") return "Dummy Data";
  return value !== null && value !== undefined ? String(value) : "";
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

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isPreparingBulkWorkbook, setIsPreparingBulkWorkbook] = useState(false);
  const [bulkWorkbookError, setBulkWorkbookError] = useState("");
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
    else setIsLoadingOrders(true);

    try {
      const query = new URLSearchParams({
        organizationId,
        limit: String(ORDERS_PAGE_SIZE),
        status: selectedStatus,
      });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/orders?${query.toString()}`, { cache: "no-store", signal });
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
      if (signal?.aborted) return;
      if (append) setIsLoadingMore(false);
      else setIsLoadingOrders(false);
    }
  }, [organizationId, selectedStatus]);

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
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadOrders]);

  const filteredOrders = orders;

  const loadMoreOrders = () => {
    if (!nextCursor || isLoadingMore) return;
    void loadOrders(undefined, true, nextCursor, true);
  };

  const handleSelectOrder = useCallback((orderId: string) => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${orderId}`,
      );
    });
  }, [organizationId, router, workspaceId]);

  const handleStatusChange = useCallback((status: string) => {
    setOrders([]);
    setNextCursor(null);
    setSelectedStatus(status as (typeof dsStatusOptions)[number]);
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

  const handleReportRowClick = useCallback((rowIdOrName: string) => {
    const matchedOrder = filteredOrders.find(
      (order) => order.id === rowIdOrName || order.orderNo === rowIdOrName,
    );
    handleSelectOrder(matchedOrder?.id ?? rowIdOrName);
  }, [filteredOrders, handleSelectOrder]);

  const handleOpenDeleteConfirmation = useCallback(() => {
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
      window.alert("Please select orders with the same Size Group.");
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
      alert(error instanceof Error ? error.message : "Unable to delete selected orders.");
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
          onNewOrder={handleNewOrder}
          toolbarActions={(
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => {
                setArticleOrderSuccess("");
                setShowArticleOrderDialog(true);
              }}
            >
              Create Order from Article
            </Button>
          )}
          onDeleteSelected={handleOpenDeleteConfirmation}
          onBulkUpload={handleBulkUpload}
          bulkUploadLabel="Bulk Upload"
          bulkUploadDisabled={isPreparingBulkWorkbook}
          onRowAction={handleVariantOrder}
          rowActionLabel="Variant"
          renderCell={renderOrderCell}
        />
        {nextCursor && !loadError && (
          <div className="mt-3 flex justify-center">
            <Button type="button" variant="secondary" size="sm" onClick={loadMoreOrders} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading..." : "Load more orders"}
            </Button>
          </div>
        )}
      </Card>

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
        <Modal open={showDeleteConfirmation} onClose={() => setShowDeleteConfirmation(false)} ariaLabel="Delete selected orders" variant="danger" size="sm" className="p-5">
          <div className="space-y-4">
            <div>
              <h3 id="delete-orders-title" className="text-base font-bold text-slate-900">Delete selected orders?</h3>
              <p className="mt-1 text-xs text-slate-500">This will permanently delete {selectedOrderIds.length} order{selectedOrderIds.length === 1 ? "" : "s"} and its finished goods and BOM records.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirmation(false)} disabled={isDeleting}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleDeleteSelected} disabled={isDeleting}>{isDeleting ? "Deleting..." : "Delete Orders"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}