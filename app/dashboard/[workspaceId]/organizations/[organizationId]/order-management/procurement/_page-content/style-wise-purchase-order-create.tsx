"use client";

import { ChevronDown, Loader2, Store, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import { formatNumber, text } from "./style-wise-purchase-order-format";
import type { GroupedPurchaseOrder, MasterPurchaseOrder } from "./style-wise-purchase-order-types";
export function MasterPurchaseOrderReport({
  masterPurchaseOrders,
  onUpdated,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  masterPurchaseOrders: MasterPurchaseOrder[];
  onUpdated: () => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const detailPath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${params?.organizationId ?? "demo-org"}/order-management/procurement/create-po/style-wise/create-po/master-group`;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [deletionError, setDeletionError] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const [activeTab, setActiveTab] = useState("po-creation");
  const [poDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryDate] = useState(() =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const toggleMaster = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const deleteMaster = async (master: MasterPurchaseOrder) => {
    const deletionEffects = master.sourceType === "STOCK"
      ? " Its Store notification, GRN verification, and allocations will also be deleted. Verified stock will be restored if it has not since been used or reserved, and source groups will return to price approval."
      : " Its subform records will also be deleted.";
    if (
      !window.confirm(
        `Delete Master Group ${master.masterPoNo}?${deletionEffects}`,
      )
    )
      return;
    setDeletingId(master.id);
    setDeletionError("");
    try {
      const response = await fetch(
        `/api/orders/procurement/master/${encodeURIComponent(master.id)}?organizationId=${encodeURIComponent(params?.organizationId ?? "demo-org")}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to delete Master Group.");
      setDeletedIds((current) => new Set(current).add(master.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(master.id);
        return next;
      });
      try {
        await onUpdated();
      } catch {
        setDeletionError("Master Group was deleted, but the procurement list could not be refreshed.");
      }
    } catch (error) {
      setDeletionError(
        error instanceof Error
          ? error.message
          : "Unable to delete Master Group.",
      );
    } finally {
      setDeletingId(null);
    }
  };
  const notifyStore = async (master: MasterPurchaseOrder) => {
    setNotifyingId(master.id);
    setNotificationError("");
    try {
      const organizationId = params?.organizationId ?? "demo-org";
      const response = await fetch(`/api/orders/procurement/master/${encodeURIComponent(master.id)}?organizationId=${encodeURIComponent(organizationId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "notify-store" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to notify the Internal Store.");
      await onUpdated();
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Unable to notify the Internal Store.");
    } finally {
      setNotifyingId(null);
    }
  };
  const visibleMasters = masterPurchaseOrders.filter(
    (master) => !deletedIds.has(master.id) && (master.sourceType === "STOCK" || !master.purchaseOrderCreated),
  );
  const tabMasters = visibleMasters.filter((master) =>
    activeTab === "notify-store"
      ? master.sourceType === "STOCK"
      : master.sourceType === "VENDOR",
  );
  const generatePurchaseOrders = async () => {
    setGenerating(true);
    setGenerationError("");
    try {
      const organizationId = params?.organizationId ?? "demo-org";
      const response = await fetch("/api/orders/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          masterPurchaseOrderIds: [...selectedIds],
          poDate,
          deliveryDate,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to generate Purchase Orders.");
      router.push(
        `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/order-management/procurement/purchase-order`,
      );
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Unable to generate Purchase Orders.",
      );
    } finally {
      setGenerating(false);
    }
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
            Stage 3
          </p>
          <h2 className="text-sm font-bold text-slate-950">
            Create purchase order
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Vendor groups generate Purchase Orders. Stock groups are sent to the Internal Store for verification.
          </p>
        </div>
        {activeTab === "po-creation" && (
          <button
            type="button"
            onClick={generatePurchaseOrders}
            disabled={generating || selectedIds.size === 0}
            className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {generating
              ? "Generating..."
              : `Generate Purchase Order${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
          </button>
        )}
      </div>
      <Tabs
        tabs={[
          { label: "PO Creation", value: "po-creation" },
          { label: "Notify Store", value: "notify-store" },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Purchase order actions"
      />
      {generationError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {generationError}
        </div>
      )}
      {deletionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {deletionError}
        </div>
      )}
      {notificationError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {notificationError}
        </div>
      )}
      {tabMasters.length === 0 ? (
          <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">
          {activeTab === "notify-store"
            ? "No stock Master Groups are ready for store notification."
            : "No vendor Master Groups are ready for PO creation."}
        </div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3">Select</th>
                  <th className="px-3 py-3">Master Group</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Raw material</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3">Stock UOM</th>
                  <th className="px-3 py-3">Buying UOM</th>
                  <th className="px-3 py-3 text-right">GST</th>
                  <th className="px-3 py-3">HSN code</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tabMasters.map((master) => (
                  <tr
                    key={master.id}
                    onClick={() =>
                      router.push(
                        `${detailPath}/${encodeURIComponent(master.id)}`,
                      )
                    }
                    className="cursor-pointer bg-white transition hover:bg-emerald-50"
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {master.sourceType === "VENDOR" && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${master.masterPoNo}`}
                          checked={selectedIds.has(master.id)}
                          onChange={() => toggleMaster(master.id)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-900">
                      {master.masterPoNo}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{master.entityName || "Missing Entity"}</td>
                    <td className="px-3 py-3">{master.sourceType === "STOCK" ? "Stock" : "Vendor"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {text(master.rawMaterial)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {master.vendor.name}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-700">
                      {text(master.price)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatNumber(master.totalGroupedQty)}
                    </td>
                    <td className="px-3 py-3">
                      {text(master.lines[0]?.stockUom)}
                    </td>
                    <td className="px-3 py-3">{text(master.buyingUom)}</td>
                    <td className="px-3 py-3 text-right">{text(master.gst)}</td>
                    <td className="px-3 py-3">{text(master.hsnCode)}</td>
                    <td className="px-3 py-3 text-right font-bold">
                      {formatNumber(master.total)}
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {master.status === "STORE_NOTIFIED"
                        ? "Awaiting Store Verification"
                        : master.status === "STOCK_ALLOCATED"
                          ? "Stock Allocated"
                          : master.status === "MASTER_GROUPED"
                            ? master.sourceType === "STOCK" ? "Ready to notify Store" : "Ready for PO"
                            : master.status}
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        {master.sourceType === "STOCK" && (master.status === "MASTER_GROUPED" ? (
                          <Button type="button" size="sm" disabled={notifyingId === master.id || deletingId === master.id} onClick={() => void notifyStore(master)}>
                            {notifyingId === master.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />}
                            Notify Store
                          </Button>
                        ) : (
                          <span className="text-slate-500">{master.status === "STORE_NOTIFIED" ? "Store notified" : "Completed"}</span>
                        ))}
                        <button
                          type="button"
                          disabled={deletingId === master.id || notifyingId === master.id}
                          onClick={() => void deleteMaster(master)}
                          aria-label={`Delete ${master.masterPoNo}`}
                          title={master.sourceType === "STOCK" ? "Delete Master Group and linked Store records" : "Delete Master Group"}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === master.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void onLoadMore()}>
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {loadingMore ? "Loading Master Groups" : "Load more Master Groups"}
          </Button>
        </div>
      )}
    </section>
  );
}
export function CreatePoStage({
  masterPurchaseOrders,
}: {
  masterPurchaseOrders: MasterPurchaseOrder[];
}) {
  const approvedOrders: GroupedPurchaseOrder[] = [];
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
          Stage 3
        </p>
        <h2 className="text-sm font-bold text-slate-950">
          Create purchase order
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Approved grouped records and master groups are ready to become
          purchase orders.
        </p>
      </div>
      {masterPurchaseOrders.map((master) => (
        <div key={master.id} className="erp-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-blue-50 px-4 py-3">
            <div>
              <p className="text-xs font-bold text-slate-950">
                {master.masterPoNo}
              </p>
              <p className="text-[10px] text-slate-600">
                Master group · {master.vendor.name} ·{" "}
                {master.sourceGroupedPoIds.length} grouped records
              </p>
            </div>
            <span className="text-xs font-bold text-blue-700">
              {formatNumber(master.totalGroupedQty)} qty
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-[10px]">
              <thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Source Grouped PO</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Style</th>
                  <th className="px-3 py-2 text-right">Grouped Qty</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {master.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-semibold">
                      {text(line.sourceGroupedPoNo)}
                    </td>
                    <td className="px-3 py-2">{text(line.sourceOrderNo)}</td>
                    <td className="px-3 py-2">{text(line.styleName)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(line.groupedQty)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatNumber(line.totalSpend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {approvedOrders.length === 0 ? (
        <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">
          {masterPurchaseOrders.length === 0
            ? "No approved grouped records are ready for PO creation."
            : "No individual grouped records are ready for PO creation."}
        </div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Grouped PO</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Raw Material</th>
                  <th className="px-3 py-3 text-right">Grouped Qty</th>
                  <th className="px-3 py-3 text-right">Lines</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {approvedOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-emerald-50/40">
                    <td className="px-3 py-3 font-bold text-slate-900">
                      {order.groupedPoNo}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{order.entityName || "Missing Entity"}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {order.vendor.name}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {text(order.rawMaterial)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold">
                      {formatNumber(order.totalGroupedQty)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {order.lines.length}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-800">
                        Price approved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
