"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { DetailedPriceApprovalCard, type GroupedPurchaseOrder } from "./style-wise-purchase-order-page";

export default function PriceApprovalDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; groupedPurchaseOrderId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const groupedPurchaseOrderId = params?.groupedPurchaseOrderId ?? "";
  const approvalPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/create-po/style-wise/approve-price`;
  const [order, setOrder] = useState<GroupedPurchaseOrder | null>(null);
  const [gstOptions, setGstOptions] = useState<Array<{ id: string; label: string; fields?: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrder = useCallback(async () => {
    const response = await fetch(`/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}&view=all`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load grouped PO details.");
    const matchingOrder = (data.groupedPurchaseOrders ?? []).find((item: GroupedPurchaseOrder) => item.id === groupedPurchaseOrderId) ?? null;
    if (!matchingOrder) throw new Error("The grouped PO could not be found.");
    setOrder(matchingOrder);
  }, [groupedPurchaseOrderId, organizationId]);

  useEffect(() => {
    loadOrder().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load grouped PO details.")).finally(() => setLoading(false));
  }, [loadOrder]);

  useEffect(() => {
    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load GST master.");
        setGstOptions(Array.isArray(data) ? data : []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load GST master."));
  }, [organizationId]);

  return <div className="mx-auto max-w-[1500px] space-y-4">
    <header className="flex items-center gap-3 border-b border-slate-200 pb-4">
      <button type="button" onClick={() => router.push(approvalPath)} aria-label="Back to price approvals" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
      <div><p className="erp-eyebrow">Style Wise PO / Approve price</p><h1 className="erp-page-heading mt-1">Grouped PO details</h1><p className="mt-1 text-sm text-slate-500">Review the raw material lines and pricing before approval.</p></div>
    </header>

    {loading ? <div className="erp-surface flex min-h-52 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading grouped PO details</div> : error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : order ? <DetailedPriceApprovalCard order={order} gstOptions={gstOptions} organizationId={organizationId} onUpdated={loadOrder} onError={setError} /> : null}
  </div>;
}