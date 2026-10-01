"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import Card from "@/components/ui/Card";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";

type PurchaseOrder = { id: string; purchaseOrderNo: string; status: string; entityId: string | null; entityName: string | null; vendor: { name: string }; lines: Array<{ id: string; rawMaterial: string | null; category: string | null; quantity: number | null }> };
type LocationOption = { id: string; label: string };
type VerificationAllocation = {
  groupedPurchaseOrderId: string;
  groupingNumber: string;
  totalGroupedQty: string;
  verificationAllocated: string;
  balanceToAllocate: string;
};
type VerificationDraft = {
  purchaseOrderLineId: string;
  masterPurchaseOrderId: string | null;
  grnNumber: string;
  rawMaterialName: string;
  grnQuantity: string;
  purchaseOrderNumber: string;
  masterGroupingNumber: string;
  poQuantity: string;
  groupedQtyGrn: string;
  verifiedQuantity: string;
  approvedQuantity: string;
  rejectedQuantity: string;
  freshExcess: string;
  totalExcess: string;
  availableToAllocate: string;
  groupedAllocated: string;
  groupedBalanceToAllocate: string;
  allocations: VerificationAllocation[];
};
type VerificationValues = { verifiedQuantity: string; approvedQuantity: string; allocations: Record<string, string> };

const quantity = (value: number | string) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function CreateGrnPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn/report`;
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [drafts, setDrafts] = useState<VerificationDraft[]>([]);
  const [values, setValues] = useState<Record<string, VerificationValues>>({});
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/orders/purchase-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load Purchase Orders."); setPurchaseOrders((data.purchaseOrders ?? []).filter((order: PurchaseOrder) => ["APPROVED", "SHARED"].includes(order.status))); })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const selectedOrder = purchaseOrders.find((order) => order.id === purchaseOrderId);
  useEffect(() => {
    if (!selectedOrder?.entityId) return;

    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/location?entityId=${encodeURIComponent(selectedOrder.entityId)}&includeInactive=false`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Locations.");
        setLocations(Array.isArray(data) ? data.map((location: { id: string; label: string }) => ({ id: location.id, label: location.label })) : []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load Locations.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocationsLoading(false);
      });

    return () => controller.abort();
  }, [organizationId, selectedOrder?.entityId]);

  async function openVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!selectedOrder?.entityId) { setError("Select a Purchase Order with an active Entity."); return; }
    if (!locationId) { setError("Select a Location for the Purchase Order Entity."); return; }
    setVerificationLoading(true);
    try {
      const response = await fetch(`/api/inventory/grn-verifications?organizationId=${encodeURIComponent(organizationId)}&purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load PO verification lines.");
      const loadedDrafts = Array.isArray(data.drafts) ? data.drafts as VerificationDraft[] : [];
      if (loadedDrafts.length === 0) throw new Error("This Purchase Order has no raw-material lines to verify.");
      setDrafts(loadedDrafts);
      setValues(Object.fromEntries(loadedDrafts.map((draft) => [draft.purchaseOrderLineId, {
        verifiedQuantity: "",
        approvedQuantity: "",
        allocations: Object.fromEntries(draft.allocations.map((allocation) => [allocation.groupedPurchaseOrderId, "0"])),
      }])));
      setVerificationOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load PO verification lines.");
    } finally {
      setVerificationLoading(false);
    }
  }

  async function postGrn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!drafts.length || drafts.some((draft) => !draft.masterPurchaseOrderId)) {
      setError("Every PO line must have a Master Group to use GRN Verification.");
      return;
    }
    if (drafts.some((draft) => !values[draft.purchaseOrderLineId]?.verifiedQuantity || values[draft.purchaseOrderLineId]?.approvedQuantity === "")) {
      setError("Enter Verified Qty and Approved Qty for every PO line.");
      return;
    }
    const lines = drafts
      .filter((draft) => Number(values[draft.purchaseOrderLineId].verifiedQuantity) > 0)
      .map((draft) => ({
        purchaseOrderLineId: draft.purchaseOrderLineId,
        verifiedQuantity: values[draft.purchaseOrderLineId].verifiedQuantity,
        approvedQuantity: values[draft.purchaseOrderLineId].approvedQuantity,
        allocations: draft.allocations.map((allocation) => ({
          groupedPurchaseOrderId: allocation.groupedPurchaseOrderId,
          verificationAllocated: values[draft.purchaseOrderLineId].allocations[allocation.groupedPurchaseOrderId] ?? "0",
        })),
      }));
    if (lines.length === 0) {
      setError("Enter a Verified Qty greater than zero for at least one PO line.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, purchaseOrderId, locationId, lines }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create GRN.");
      router.replace(`${reportPath}/${encodeURIComponent(data.receipt.id)}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create GRN.");
    } finally {
      setSaving(false);
    }
  }

  const noMasterGroupLine = drafts.some((draft) => !draft.masterPurchaseOrderId);
  const quantityPreview = (value: number) => Number.isFinite(value) ? quantity(value) : "-";

  return (
    <UiPage as="div">
      <Section className="space-y-3">
        <Link href={reportPath} className="text-xs font-semibold text-emerald-700">&larr; RM GRN Report</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Purchase Order Receiving</p>
            {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Create GRN</h1>
        </div>
        {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</Card>}
        <form onSubmit={(event) => void openVerification(event)}>
          <Card className="space-y-3 p-3">
            <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Purchase Order"
              value={purchaseOrderId}
              onChange={(event) => {
                const nextPurchaseOrderId = event.target.value;
                const nextOrder = purchaseOrders.find((order) => order.id === nextPurchaseOrderId);
                const entityChanged = nextOrder?.entityId !== selectedOrder?.entityId;
                setPurchaseOrderId(nextPurchaseOrderId);
                setLocationId("");
                setDrafts([]);
                setValues({});
                setVerificationOpen(false);
                if (entityChanged) {
                  setLocations([]);
                  setLocationsLoading(Boolean(nextOrder?.entityId));
                }
              }}
              disabled={loading}
              options={[
                { value: "", label: loading ? "Loading..." : "Select approved Purchase Order" },
                ...purchaseOrders.map((order) => ({ value: order.id, label: `${order.purchaseOrderNo} - ${order.vendor.name}` })),
              ]}
            />
            <Select
              label="Location"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={!selectedOrder?.entityId || locationsLoading || locations.length === 0}
              options={[
                {
                  value: "",
                  label: !selectedOrder ? "Select a Purchase Order first" : !selectedOrder.entityId ? "Selected PO has no active Entity" : locationsLoading ? "Loading Locations..." : locations.length === 0 ? "No active Locations for this Entity" : "Select Location",
                },
                ...locations.map((location) => ({ value: location.id, label: location.label })),
              ]}
            />
          </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={verificationLoading || !selectedOrder?.entityId || !locationId}>
                {verificationLoading ? "Loading Verification..." : "Submit"}
              </Button>
            </div>
          </Card>
        </form>
      </Section>
      <Modal
        open={verificationOpen}
        onClose={() => { if (!saving) setVerificationOpen(false); }}
        ariaLabelledBy="create-grn-verification-title"
        size="xl"
        closeOnBackdrop={!saving}
        className="p-0"
      >
        <form onSubmit={(event) => void postGrn(event)}>
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h2 id="create-grn-verification-title" className="text-sm font-bold text-slate-900">GRN Verification</h2>
            <Button type="button" size="sm" variant="ghost" onClick={() => setVerificationOpen(false)} disabled={saving}>Cancel</Button>
          </div>
          <div className="max-h-[76vh] space-y-3 overflow-y-auto p-3">
            {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
            {noMasterGroupLine && <div role="alert" className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">This PO contains a line without a Master Group. GRN Verification cannot be submitted for this PO.</div>}
            {drafts.map((draft) => {
              const lineValues = values[draft.purchaseOrderLineId] ?? { verifiedQuantity: "", approvedQuantity: "", allocations: {} };
              const verified = Number(lineValues.verifiedQuantity || 0);
              const approved = Number(lineValues.approvedQuantity || 0);
              const rejected = verified - approved;
              const freshExcess = Math.max(approved - Number(draft.groupedQtyGrn), 0);
              const totalExcess = freshExcess + rejected;
              const availableToAllocate = verified - totalExcess;
              const groupedAllocated = draft.allocations.reduce((sum, allocation) => sum + Number(lineValues.allocations[allocation.groupedPurchaseOrderId] ?? "0"), 0);
              const groupedBalance = draft.allocations.reduce((sum, allocation) => sum + Number(allocation.totalGroupedQty) - Number(lineValues.allocations[allocation.groupedPurchaseOrderId] ?? "0"), 0);
              const overAllocation = draft.allocations.some((allocation) => Number(lineValues.allocations[allocation.groupedPurchaseOrderId] ?? "0") > Number(allocation.totalGroupedQty));

              return (
                <section key={draft.purchaseOrderLineId} className="space-y-2 rounded border border-slate-200 p-2.5">
                  <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Master Group *</p><p className="text-xs font-semibold text-slate-900">{draft.masterGroupingNumber || "-"}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">GRN No</p><p className="text-xs font-semibold text-slate-900">{draft.grnNumber}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Purchase Order</p><p className="text-xs font-semibold text-slate-900">{draft.purchaseOrderNumber}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Raw Material</p><p className="text-xs font-semibold text-slate-900">{draft.rawMaterialName || "-"}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">PO Qty</p><p className="text-xs font-semibold text-slate-900">{quantity(draft.poQuantity)}</p></div>
                    <Input label="Verified Qty" type="number" min="0" step="0.01" required value={lineValues.verifiedQuantity} disabled={saving || !draft.masterPurchaseOrderId} onChange={(event) => setValues((current) => ({ ...current, [draft.purchaseOrderLineId]: { ...lineValues, verifiedQuantity: event.target.value } }))} />
                    <Input label="Approved Qty" type="number" min="0" step="0.01" required value={lineValues.approvedQuantity} disabled={saving || !draft.masterPurchaseOrderId} onChange={(event) => setValues((current) => ({ ...current, [draft.purchaseOrderLineId]: { ...lineValues, approvedQuantity: event.target.value } }))} />
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Rejected Qty</p><p className="text-xs font-semibold text-slate-900">{quantityPreview(rejected)}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Fresh Excess</p><p className="text-xs font-semibold text-slate-900">{quantityPreview(freshExcess)}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Total Excess</p><p className="text-xs font-semibold text-slate-900">{quantityPreview(totalExcess)}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Available To Allocate</p><p className="text-xs font-semibold text-slate-900">{quantityPreview(availableToAllocate)}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Grouped Allocated</p><p className="text-xs font-semibold text-slate-900">{quantityPreview(groupedAllocated)}</p></div>
                    <div><p className="text-[9px] font-semibold uppercase text-slate-500">Grouped Balance to Allocate</p><p className="text-xs font-semibold text-slate-900">{quantityPreview(groupedBalance)}</p></div>
                  </div>
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="w-full min-w-[560px] text-left text-[11px]">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-semibold uppercase text-slate-500">
                        <tr><th className="px-2 py-1.5">Grouping No</th><th className="px-2 py-1.5 text-right">Total Grouped Qty</th><th className="px-2 py-1.5">Verification Allocated</th><th className="px-2 py-1.5 text-right">Balance to Allocate</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draft.allocations.map((allocation) => {
                          const allocated = Number(lineValues.allocations[allocation.groupedPurchaseOrderId] ?? "0");
                          return <tr key={allocation.groupedPurchaseOrderId}>
                            <td className="px-2 py-1.5 font-semibold">{allocation.groupingNumber}</td>
                            <td className="px-2 py-1.5 text-right">{quantity(allocation.totalGroupedQty)}</td>
                            <td className="w-40 px-2 py-1"><Input aria-label={`Verification Allocated for ${allocation.groupingNumber}`} type="number" min="0" max={allocation.totalGroupedQty} step="0.01" value={lineValues.allocations[allocation.groupedPurchaseOrderId] ?? "0"} disabled={saving || !draft.masterPurchaseOrderId} onChange={(event) => setValues((current) => ({ ...current, [draft.purchaseOrderLineId]: { ...lineValues, allocations: { ...lineValues.allocations, [allocation.groupedPurchaseOrderId]: event.target.value } } }))} /></td>
                            <td className="px-2 py-1.5 text-right">{quantityPreview(Number(allocation.totalGroupedQty) - allocated)}</td>
                          </tr>;
                        })}
                        {draft.allocations.length === 0 && <tr><td colSpan={4} className="px-2 py-2 text-center text-slate-500">No grouping rows are linked to this Master Group.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {(approved > verified || overAllocation || groupedAllocated > availableToAllocate) && (
                    <p role="alert" className="text-[11px] text-red-700">
                      {approved > verified ? "Approved Qty cannot exceed Verified Qty." : overAllocation ? "A grouping allocation exceeds its remaining balance." : "Grouped Allocated cannot exceed Available To Allocate."}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          <div className="flex justify-end border-t border-slate-200 px-3 py-2">
            <Button type="submit" disabled={saving || noMasterGroupLine || drafts.length === 0}>
              {saving ? "Saving GRN..." : "Save Verification & Post GRN"}
            </Button>
          </div>
        </form>
      </Modal>
    </UiPage>
  );
}
