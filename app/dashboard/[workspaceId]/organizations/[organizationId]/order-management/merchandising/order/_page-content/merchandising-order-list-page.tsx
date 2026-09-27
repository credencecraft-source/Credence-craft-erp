"use client";

import { useEffect, useMemo, useState, startTransition, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import MerchandisingOrderVariantDialog from "@/components/erp/merchandising-order-variant-dialog";
import { ReportGrid } from "@/components/reports/report-grid-display";

type OrderRecord = {
  id: string;
  orderNo: string;
  finishedGoods?: SourceFinishedGoodsRow[] | null;
  entityName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  season?: string | null;
  article?: string | null;
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

type SourceFinishedGoodsRow = {
  size?: unknown;
  buyerSize?: unknown;
  buyer_size?: unknown;
  label?: unknown;
  name?: unknown;
};

function toVariantSizeRows(rows: SourceFinishedGoodsRow[]) {
  const seenSizes = new Set<string>();

  return rows.flatMap((row) => {
    const size = [row.size, row.buyerSize, row.buyer_size, row.label, row.name]
      .map((value) => String(value ?? "").trim())
      .find(Boolean);

    if (!size || seenSizes.has(size)) return [];
    seenSizes.add(size);
    return [{ size, qty: "" }];
  });
}

type FilterableOrderField =
  | "orderNo"
  | "entityName"
  | "category"
  | "subCategory"
  | "season"
  | "article"
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
  { key: "article", label: "Article" },
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

export default function MerchandisingOrdersPage() {
  const params = useParams<{
    workspaceId: string;
    organizationId: string;
  }>();

  const router = useRouter();

  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedStatus, setSelectedStatus] =
    useState<(typeof dsStatusOptions)[number]>("Draft");

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
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

  const loadOrders = useCallback(async (signal?: AbortSignal, force = false) => {
    const now = Date.now();
    if (!force && now - lastLoadedAt.current < 1500) return;
    lastLoadedAt.current = now;

    try {
      const response = await fetch(
        `/api/orders?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store", signal },
      );
      const data = await response.json();
      setOrders(data?.orders ?? []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Unable to load orders", error);
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => {
      void loadOrders(controller.signal, true);
    }, 0);

    const handleFocus = () => {
      void loadOrders(undefined, false);
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearTimeout(initialLoad);
      controller.abort();
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return selectedStatus === "Draft"
      ? orders.filter((order) => order.finalStatus === "Draft")
      : orders.filter((order) => order.finalStatus === selectedStatus);
  }, [orders, selectedStatus]);

  const handleSelectOrder = (orderId: string) => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${orderId}`,
      );
    });
  };

  const handleToggleOrderSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        if (current.includes(orderId)) return current;
        return [...current, orderId];
      }
      return current.filter((id) => id !== orderId);
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(filteredOrders.map((order) => order.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleNewOrder = () => {
    startTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/create`,
      );
    });
  };

  const handleVariantOrder = async (orderId: string) => {
    if (isCreatingVariantRef.current) return;
    setVariantSuccessMessage("");
    setVariantCreateError("");
    const loadSequence = ++variantLoadSequence.current;
    const sourceOrder = orders.find((order) => order.id === orderId);
    const sourceSizeGroup = String(sourceOrder?.sizeGroup ?? "").trim();
    const cachedSizeRows = toVariantSizeRows(sourceOrder?.finishedGoods ?? []);
    setVariantTargetOrderId(orderId);
    setVariantPreparedToken("");
    setVariantSourceOrderNo(sourceOrder?.orderNo ?? "");
    setVariantSizeGroup(sourceSizeGroup);
    setVariantRows(cachedSizeRows);
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

      const mappedSizes = Array.isArray(data?.sizes) ? data.sizes : [];
      const mappedSizeRows = toVariantSizeRows(mappedSizes.map((size: unknown) => ({ size })));
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
  };

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
        {variantCreateError && !showVariantDialog && (
          <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            Order creation failed: {variantCreateError}
          </p>
        )}
        <ReportGrid
          title="Orders List"
          records={filteredOrders}
          fields={reportFilterFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={(fields) => setVisibleReportFields(fields as FilterableOrderField[])}
          storageKey={`credence-craft-orders-${organizationId}`}
          rowIdSelector={(order) => order.id}
          selectedIds={selectedOrderIds}
          onRowClick={(rowIdOrName) => {
            const matchedOrder = filteredOrders.find(
              (o) => o.id === rowIdOrName || o.orderNo === rowIdOrName
            );
            if (matchedOrder) {
              handleSelectOrder(matchedOrder.id);
            } else {
              handleSelectOrder(rowIdOrName);
            }
          }}
          onToggleSelectAll={handleToggleSelectAll}
          onToggleRowSelection={handleToggleOrderSelection}
          statusOptions={dsStatusOptions}
          selectedStatus={selectedStatus}
          onStatusChange={(status) => setSelectedStatus(status as any)}
          onNewOrder={handleNewOrder}
          onDeleteSelected={() => setShowDeleteConfirmation(true)}
          onRowAction={handleVariantOrder}
          rowActionLabel="Variant"
          renderCell={(fieldKey, order) => {
            const val = order[fieldKey as keyof OrderRecord];
            return val !== null && val !== undefined ? String(val) : "";
          }}
        />
      </Card>

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