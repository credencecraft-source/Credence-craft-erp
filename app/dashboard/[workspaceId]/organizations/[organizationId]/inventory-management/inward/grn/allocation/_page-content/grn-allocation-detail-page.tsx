"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type GrnAllocation = {
  id: string;
  createdAt: string;
  grnNumber: string;
  purchaseOrderNumber: string;
  rawMaterialName: string;
  masterGroupingNumber: string;
  groupingNumber: string;
  totalGroupedQuantity: string;
  verificationAllocated: string;
  verifiedQuantity: string;
  approvedQuantity: string;
  rejectedQuantity: string;
  orderAllocations: Array<{
    id: string;
    orderNo: string;
    styleName: string;
    groupedQuantity: string;
    allocatedQuantity: string;
  }>;
};

type EditableAllocationLine = {
  groupedPurchaseOrderLineId: string;
  orderNo: string;
  styleNo: string;
  alreadyAllocated: string;
  balanceToAllocate: string;
  grouped: string;
  allocate: string;
  maxAllocatable: string;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "-"}</dd>
    </div>
  );
}

function quantity(value: string) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function GrnAllocationDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; allocationId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allocation, setAllocation] = useState<GrnAllocation | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState<EditableAllocationLine[]>([]);
  const [editLinesLoading, setEditLinesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reportPath = `/dashboard/${params.workspaceId}/organizations/${params.organizationId}/inventory-management/inward/grn/allocation`;
  const selectedLineId = searchParams.get("groupedPurchaseOrderLineId");

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/inventory/grn-verifications?organizationId=${encodeURIComponent(params.organizationId)}&allocationId=${encodeURIComponent(params.allocationId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.allocation) {
          throw new Error(data.error || "Unable to load GRN allocation.");
        }
        setAllocation(data.allocation as GrnAllocation);
        setCanEdit(data.canEdit === true);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load GRN allocation.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.allocationId, params.organizationId, reloadKey]);

  const loadEditLines = async () => {
    setEditLinesLoading(true);
    setEditError("");
    try {
      const response = await fetch(
        `/api/inventory/grn-order-allocations?organizationId=${encodeURIComponent(params.organizationId)}&allocationId=${encodeURIComponent(params.allocationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.lines)) {
        throw new Error(data.error || "Unable to load order allocation lines.");
      }
      setEditLines(data.lines as EditableAllocationLine[]);
    } catch (loadError: unknown) {
      setEditError(loadError instanceof Error ? loadError.message : "Unable to load order allocation lines.");
    } finally {
      setEditLinesLoading(false);
    }
  };

  const beginEdit = () => {
    setEditing(true);
    setSuccess("");
    void loadEditLines();
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditLines([]);
    setEditError("");
  };

  const changeLineQuantity = (lineId: string, value: string) => {
    setEditLines((current) => current.map((line) => (
      line.groupedPurchaseOrderLineId === lineId ? { ...line, allocate: value } : line
    )));
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setEditError("");
    setSuccess("");
    try {
      const response = await fetch("/api/inventory/grn-order-allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: params.organizationId,
          allocationId: params.allocationId,
          lines: editLines.map((line) => ({
            groupedPurchaseOrderLineId: line.groupedPurchaseOrderLineId,
            allocatedQuantity: Number(line.allocate),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save order allocation.");
      setEditing(false);
      setEditLines([]);
      setSuccess("GRN order allocation updated.");
      setLoading(true);
      setReloadKey((key) => key + 1);
    } catch (saveError: unknown) {
      setEditError(saveError instanceof Error ? saveError.message : "Unable to save order allocation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Inward / GRN Allocation</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">
              {allocation?.grnNumber ?? "GRN Allocation Details"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button type="button" variant="secondary" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                <Button type="submit" form="grn-allocation-edit-form" disabled={saving || editLinesLoading || editLines.length === 0}>
                  {saving ? "Saving..." : "Save Allocation"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>
                  Back to GRN Allocations
                </Button>
                {allocation && canEdit ? (
                  <Button type="button" onClick={beginEdit}>Edit Allocation</Button>
                ) : null}
              </>
            )}
          </div>
        </header>
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading GRN allocation...</p> : null}
        {success ? <p role="status" className="text-sm font-medium text-[var(--erp-success-text)]">{success}</p> : null}
        {error ? (
          <Card role="alert" className="space-y-3 border-[var(--erp-danger)] text-sm">
            <p>{error}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError("");
                setAllocation(null);
                setReloadKey((key) => key + 1);
              }}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        {editError ? (
          <Card role="alert" className="space-y-3 text-sm">
            <p>{editError}</p>
            {editing ? (
              <Button type="button" variant="secondary" onClick={() => void loadEditLines()} disabled={editLinesLoading || saving}>
                {editLinesLoading ? "Loading order lines..." : "Retry"}
              </Button>
            ) : null}
          </Card>
        ) : null}
        {allocation ? (
          <>
            {!editing ? <Card>
              <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label="GRN / Stock Source" value={allocation.grnNumber} />
                <DetailField label="Purchase Order" value={allocation.purchaseOrderNumber} />
                <DetailField label="Raw Material" value={allocation.rawMaterialName} />
                <DetailField label="Master Group" value={allocation.masterGroupingNumber} />
                <DetailField label="Grouping Number" value={allocation.groupingNumber} />
                <DetailField label="Created" value={new Date(allocation.createdAt).toLocaleString("en-IN")} />
                <DetailField label="Grouped Quantity" value={quantity(allocation.totalGroupedQuantity)} />
                <DetailField label="Verification Allocated" value={quantity(allocation.verificationAllocated)} />
                <DetailField label="Verified Quantity" value={quantity(allocation.verifiedQuantity)} />
                <DetailField label="Approved Quantity" value={quantity(allocation.approvedQuantity)} />
                <DetailField label="Rejected Quantity" value={quantity(allocation.rejectedQuantity)} />
              </dl>
            </Card> : null}
            {editing ? (
              <Card className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--erp-text)]">Edit order allocations</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">
                    Quantities are checked again against current stock and allocation balances when saved.
                  </p>
                </div>
                {editLinesLoading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading order lines...</p> : null}
                {!editLinesLoading && editLines.length > 0 ? (
                  <form id="grn-allocation-edit-form" onSubmit={saveEdit} className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[40rem] text-left text-sm">
                        <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-muted)]">
                          <tr>
                            <th className="px-3 py-2">Order</th>
                            <th className="px-3 py-2">Style</th>
                            <th className="px-3 py-2 text-right">Grouped</th>
                            <th className="px-3 py-2 text-right">Allocated Elsewhere</th>
                            <th className="px-3 py-2">Allocate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editLines.map((line) => (
                            <tr key={line.groupedPurchaseOrderLineId} className="border-t border-[var(--erp-border)]">
                              <td className="px-3 py-2">{line.orderNo}</td>
                              <td className="px-3 py-2">{line.styleNo || "-"}</td>
                              <td className="px-3 py-2 text-right">{quantity(line.grouped)}</td>
                              <td className="px-3 py-2 text-right">{quantity(line.alreadyAllocated)}</td>
                              <td className="px-3 py-2">
                                <Input
                                  aria-label={`Allocate quantity for ${line.orderNo}`}
                                  type="number"
                                  min="0"
                                  max={line.maxAllocatable}
                                  step="any"
                                  required
                                  value={line.allocate}
                                  disabled={saving}
                                  onChange={(event) => changeLineQuantity(line.groupedPurchaseOrderLineId, event.target.value)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </form>
                ) : null}
                {!editLinesLoading && editLines.length === 0 && !editError ? (
                  <p className="text-sm text-[var(--erp-muted)]">No order lines are available for this allocation.</p>
                ) : null}
              </Card>
            ) : null}
            {!editing ? <Card className="space-y-3">
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Order allocations</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Style</th>
                      <th className="px-3 py-2 text-right">Grouped</th>
                      <th className="px-3 py-2 text-right">Allocated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.orderAllocations.map((line) => (
                      <tr
                        key={line.id}
                        className={`border-t border-[var(--erp-border)] ${line.id === selectedLineId ? "bg-[var(--erp-brand-soft)]" : ""}`}
                      >
                        <td className="px-3 py-2">{line.orderNo}</td>
                        <td className="px-3 py-2">{line.styleName || "-"}</td>
                        <td className="px-3 py-2 text-right">{quantity(line.groupedQuantity)}</td>
                        <td className="px-3 py-2 text-right">{quantity(line.allocatedQuantity)}</td>
                      </tr>
                    ))}
                    {allocation.orderAllocations.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-[var(--erp-muted)]">No order allocations have been recorded.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card> : null}
          </>
        ) : null}
      </Section>
    </Page>
  );
}
