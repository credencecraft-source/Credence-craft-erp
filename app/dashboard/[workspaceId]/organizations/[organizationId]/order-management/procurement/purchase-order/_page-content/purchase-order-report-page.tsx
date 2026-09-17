"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";

type PurchaseOrder = {
  id: string;
  purchaseOrderNo: string;
  vendor: { name: string; email?: string | null };
  status: string;
  poDate: string;
  deliveryDate: string | null;
  total: number;
};

type PurchaseOrderField = "purchaseOrderNo" | "vendorName" | "poDate" | "deliveryDate" | "status" | "total";

const reportFields: Array<{ key: PurchaseOrderField; label: string }> = [
  { key: "purchaseOrderNo", label: "PO Number" },
  { key: "vendorName", label: "Vendor" },
  { key: "poDate", label: "PO Date" },
  { key: "deliveryDate", label: "Delivery Date" },
  { key: "status", label: "Status" },
  { key: "total", label: "Grand Total" },
];

const number = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-IN") : "To be confirmed");

export default function PurchaseOrderReportPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; linkedReceipts?: Array<{ id: string; receiptNo: string }>; linkedGateEntries?: Array<{ id: string; entryNo: string }> } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<PurchaseOrderField[]>(reportFields.map((field) => field.key));

  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/order-management/procurement`;
  const purchaseOrderPath = `${basePath}/purchase-order`;

  const loadOrders = async () => {
    const response = await fetch(`/api/orders/purchase-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load Purchase Orders.");
    setOrders((data.purchaseOrders ?? []).map((order: PurchaseOrder) => ({ ...order, status: order.status === "OPEN" ? "DRAFT" : order.status })));
  };

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    loadOrders()
      .catch((loadError) => setError({ message: loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders." }))
      .finally(() => setLoading(false));
  }, [organizationId]);

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
    () => orders.map((order) => ({ ...order, vendorName: order.vendor?.name ?? "" })),
    [orders],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={() => router.push(basePath)}
          aria-label="Back to procurement"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="erp-eyebrow">Procurement</p>
          <h1 className="erp-page-heading mt-1">Purchase Orders</h1>
          <p className="mt-1 text-xs text-slate-500">Header-level Purchase Order register</p>
        </div>
      </header>

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
                case "vendorName":
                  return row.vendorName;
                case "poDate":
                  return date(row.poDate);
                case "deliveryDate":
                  return date(row.deliveryDate);
                case "status":
                  return row.status;
                case "total":
                  return number(row.total);
                default:
                  return "";
              }
            }}
            emptyMessage="No Purchase Orders have been generated."
          />
        </div>
      )}
    </div>
  );
}