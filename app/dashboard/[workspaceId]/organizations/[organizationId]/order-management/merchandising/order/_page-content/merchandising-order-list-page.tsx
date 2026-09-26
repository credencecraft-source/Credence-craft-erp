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
  const [variantTargetOrderId, setVariantTargetOrderId] = useState<string | null>(null);
  const [variantRows, setVariantRows] = useState<Array<{ size: string; qty: string }>>([]);
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
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to load order for creating a variant.");
      }

      const order = data?.order ?? {};
      const sourceRows = Array.isArray(order.finishedGoods)
        ? order.finishedGoods
        : Array.isArray(order.finished_goods)
          ? order.finished_goods
          : [];
      let sizeRows = toVariantSizeRows(sourceRows);

      const sourceSizeGroup = String(order.sizeGroup ?? "").trim();
      if (sizeRows.length === 0 && sourceSizeGroup) {
        const lookupResponse = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/master-data/order-lookups`,
          { cache: "no-store" },
        );
        const lookupData = await lookupResponse.json().catch(() => null);
        if (!lookupResponse.ok) {
          throw new Error(lookupData?.error || "Unable to load the source order's Size Group sizes.");
        }

        const sizeGroups = lookupData?.masterOptions?.["size-group"];
        const selectedSizeGroup = Array.isArray(sizeGroups)
          ? sizeGroups.find((group: Record<string, unknown>) =>
              [group.label, group.id, group.value_id]
                .some((value) => String(value ?? "").trim() === sourceSizeGroup),
            )
          : null;
        const mappedSizes = Array.isArray(selectedSizeGroup?.sizes) ? selectedSizeGroup.sizes : [];
        sizeRows = toVariantSizeRows(mappedSizes.map((size: unknown) =>
          typeof size === "object" && size !== null ? size as SourceFinishedGoodsRow : { size },
        ));
      }

      if (sizeRows.length === 0) {
        throw new Error("The source order has no finished-goods sizes or mapped Size Group sizes to create a variant from.");
      }

      setVariantTargetOrderId(orderId);
      setVariantRows(sizeRows);
      setVariantDraft({
        styleName: "",
        colors: "",
      });
      setShowVariantDialog(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to load order for creating a variant.");
    }
  };

  const handleConfirmVariant = () => {
    if (!variantTargetOrderId) return;

    const styleName = variantDraft.styleName.trim();
    const colors = variantDraft.colors.trim();

    if (!styleName || !colors) {
      alert("Please enter style name and color before creating a variant.");
      return;
    }

    const cleanedRows = variantRows
      .map((row) => ({ size: row.size, qty: String(row.qty ?? "").trim() }))
      .filter((row) => row.size && row.qty !== "");

    if (cleanedRows.length === 0) {
      alert("Please enter quantity for at least one size row before creating a variant.");
      return;
    }

    const payload = {
      styleName,
      colors,
      rows: cleanedRows,
    };

    const params = new URLSearchParams({
      variantFrom: variantTargetOrderId,
      variantData: JSON.stringify(payload),
    });

    startTransition(() => {
      setShowVariantDialog(false);
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/create?${params.toString()}`,
      );
    });
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
        variantDraft={variantDraft}
        variantRows={variantRows}
        onDraftChange={(changes) => setVariantDraft((current) => ({ ...current, ...changes }))}
        onRowsChange={setVariantRows}
        onClose={() => setShowVariantDialog(false)}
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