"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";

type PurchaseOrder = {
  id: string;
  purchaseOrderNo: string;
  entityName: string;
  vendor: { name: string; email?: string | null };
  status: string;
  poDate: string;
  deliveryDate: string | null;
  total: number;
  lines: Array<{ gst: number | null; hsnCode: string | null; buyingUom: string | null }>;
};

type PurchaseOrderField = "purchaseOrderNo" | "entityName" | "vendorName" | "poDate" | "deliveryDate" | "status" | "buyingUom" | "gst" | "hsnCode" | "total";

const reportFields: Array<{ key: PurchaseOrderField; label: string }> = [
  { key: "purchaseOrderNo", label: "PO Number" },
  { key: "entityName", label: "Entity" },
  { key: "vendorName", label: "Vendor" },
  { key: "poDate", label: "PO Date" },
  { key: "deliveryDate", label: "Delivery Date" },
  { key: "status", label: "Status" },
  { key: "buyingUom", label: "Buying UOM" },
  { key: "gst", label: "GST" },
  { key: "hsnCode", label: "HSN Code" },
  { key: "total", label: "Grand Total" },
];

const number = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-IN") : "To be confirmed");

async function fetchPurchaseOrderReportPage(organizationId: string, cursor?: string, search = "") {
  const query = new URLSearchParams({ organizationId, view: "report", limit: "50" });
  if (cursor) query.set("cursor", cursor);
  if (search.trim()) query.set("search", search.trim());
  const response = await fetch(`/api/orders/purchase-orders?${query.toString()}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Unable to load Purchase Orders.");
  return data as { purchaseOrders?: PurchaseOrder[]; nextCursor?: string | null };
}

export default function PurchaseOrderReportPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(() => Boolean(params?.organizationId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<{ message: string; linkedReceipts?: Array<{ id: string; receiptNo: string }>; linkedGateEntries?: Array<{ id: string; entryNo: string }> } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<PurchaseOrderField[]>(reportFields.map((field) => field.key));

  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/order-management/procurement`;
  const purchaseOrderPath = `${basePath}/purchase-order`;

  const loadOrders = useCallback(async (cursor?: string, append = false) => {
    const data = await fetchPurchaseOrderReportPage(organizationId, cursor, searchTerm);
    const page = (data.purchaseOrders ?? []).map((order: PurchaseOrder) => ({ ...order, status: order.status === "OPEN" ? "DRAFT" : order.status }));
    setOrders((current) => append ? [...current, ...page] : page);
    setNextCursor(data.nextCursor ?? null);
  }, [organizationId, searchTerm]);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      fetchPurchaseOrderReportPage(organizationId, undefined, searchTerm)
        .then((data) => {
          if (!active) return;
          const page = (data.purchaseOrders ?? []).map((order) => ({ ...order, status: order.status === "OPEN" ? "DRAFT" : order.status }));
          setOrders(page);
          setNextCursor(data.nextCursor ?? null);
        })
        .catch((loadError) => {
          if (active) setError({ message: loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders." });
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, searchTerm ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [organizationId, searchTerm]);

  const loadMoreOrders = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadOrders(nextCursor, true);
    } catch (loadError) {
      setError({ message: loadError instanceof Error ? loadError.message : "Unable to load more Purchase Orders." });
    } finally {
      setLoadingMore(false);
    }
  };

  const deleteSelectedOrders = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected Purchase Order${selectedIds.length > 1 ? "s" : ""}?`);
    if (!confirmed) return;

    try {
      const results = await Promise.all(
        selectedIds.map(async (id) => {
          const response = await fetch(`/api/orders/purchase-orders/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`, { method: "DELETE" });
          const data = await response.json().catch(() => null);
          return { response, data };
        }),
      );

      const failed = results.find((result) => !result.response.ok);
      if (failed) {
        const payload = failed.data ?? {};
        const linkedReceipts = Array.isArray(payload.linkedReceipts) ? payload.linkedReceipts : [];
        const linkedGateEntries = Array.isArray(payload.linkedGateEntries) ? payload.linkedGateEntries : [];
        throw Object.assign(new Error(payload.error || "One or more Purchase Orders could not be deleted."), {
          linkedReceipts,
          linkedGateEntries,
        });
      }

      setOrders((current) => current.filter((order) => !selectedIds.includes(order.id)));
      setSelectedIds([]);
      setError(null);
    } catch (deleteError) {
      const details = deleteError instanceof Error ? deleteError : new Error("Unable to delete Purchase Orders.");
      const linkedReceipts = "linkedReceipts" in details ? ((details as Error & { linkedReceipts?: Array<{ id: string; receiptNo: string }> }).linkedReceipts ?? []) : [];
      const linkedGateEntries = "linkedGateEntries" in details ? ((details as Error & { linkedGateEntries?: Array<{ id: string; entryNo: string }> }).linkedGateEntries ?? []) : [];
      setError({ message: details.message, linkedReceipts, linkedGateEntries });
    }
  };

  const reportRows = useMemo(
    () => orders.map((order) => ({
      ...order,
      vendorName: order.vendor?.name ?? "",
      buyingUom: [...new Set(order.lines.map((line) => line.buyingUom).filter(Boolean))].join(", "),
      gst: [...new Set(order.lines.map((line) => line.gst).filter((value): value is number => value !== null))].join(", "),
      hsnCode: [...new Set(order.lines.map((line) => line.hsnCode).filter(Boolean))].join(", "),
    })),
    [orders],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      {loading ? (
        <div className="erp-surface flex min-h-48 items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          Loading Purchase Orders
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error.message}</p>
          {error.linkedReceipts && error.linkedReceipts.length > 0 ? (
            <div className="mt-2 space-y-1">
              <p className="font-semibold text-red-800">Linked GRN records:</p>
              <ul className="list-disc pl-5 space-y-1">
                {error.linkedReceipts.map((receipt) => (
                  <li key={receipt.id}>
                    <a
                      href={`/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/inventory-management/inward/grn/report/${encodeURIComponent(receipt.id)}`}
                      className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
                    >
                      {receipt.receiptNo}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error.linkedGateEntries && error.linkedGateEntries.length > 0 ? (
            <div className="mt-2 space-y-1">
              <p className="font-semibold text-red-800">Linked gate entries:</p>
              <ul className="list-disc pl-5">
                {error.linkedGateEntries.map((entry) => (
                  <li key={entry.id}>{entry.entryNo}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <ReportGrid
            title="Purchase Orders"
            records={reportRows}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(next) => setVisibleFields(next as PurchaseOrderField[])}
            rowIdSelector={(row) => row.id}
            selectedIds={selectedIds}
            onSearchQueryChange={(query) => {
              setSearchTerm(query);
              setLoading(true);
              setError(null);
              setOrders([]);
              setNextCursor(null);
              setSelectedIds([]);
            }}
            onRowClick={(recordId) => router.push(`${purchaseOrderPath}/${encodeURIComponent(recordId)}`)}
            onToggleSelectAll={(checked) => setSelectedIds(checked ? reportRows.map((row) => row.id) : [])}
            onToggleRowSelection={(recordId, checked) =>
              setSelectedIds((current) => (checked ? [...new Set([...current, recordId])] : current.filter((id) => id !== recordId)))
            }
            onDeleteSelected={deleteSelectedOrders}
            renderCell={(fieldKey, row) => {
              switch (fieldKey as PurchaseOrderField) {
                case "purchaseOrderNo":
                  return row.purchaseOrderNo;
                case "entityName":
                  return row.entityName || "Missing Entity";
                case "vendorName":
                  return row.vendorName;
                case "poDate":
                  return date(row.poDate);
                case "deliveryDate":
                  return date(row.deliveryDate);
                case "status":
                  return row.status;
                case "buyingUom":
                  return row.buyingUom;
                case "gst":
                  return row.gst;
                case "hsnCode":
                  return row.hsnCode;
                case "total":
                  return number(row.total);
                default:
                  return "";
              }
            }}
            emptyMessage="No Purchase Orders have been generated."
          />
          {nextCursor && (
            <div className="flex justify-center border-t border-slate-200 p-3">
              <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void loadMoreOrders()}>
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {loadingMore ? "Loading Purchase Orders" : "Load more Purchase Orders"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}