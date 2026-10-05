"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";

type AllocationRow = {
  id: string;
  verificationId: string;
  grnNumber: string;
  purchaseOrderNumber: string;
  rawMaterialName: string;
  masterGroupingNumber: string;
  groupingNumber: string;
  totalGroupedQty: number | string;
  verificationAllocated: number | string;
  balanceToAllocate: number | string;
  orderAllocations: Array<{
    groupedPurchaseOrderLineId: string;
    orderNo: string;
    styleNo: string;
    pickedQuantity: number | string;
    balanceStock: number | string;
    alreadyAllocated: number | string;
    balanceToAllocate: number | string;
    grouped: number | string;
    allocate: number | string;
  }>;
};

type AllocationDetailRow = {
  id: string;
  grnNumber: string;
  purchaseOrderNumber: string;
  orderNo: string;
  styleNo: string;
  groupedPurchaseOrderLineId: string;
  pickedQuantity: number | string;
  balanceStock: number | string;
  alreadyAllocated: number | string;
  balanceToAllocate: number | string;
  grouped: number | string;
  allocate: number | string;
};

type PickHistoryRecord = {
  id: string;
  orderNo: string;
  styleNo: string;
  workOrderNo: string;
  requestedBy: string | null;
  requestedAt: string;
  requestedQuantity: string;
  pickedBy: string | null;
  pickedAt: string | null;
  pickedQuantity: string;
  rawMaterial: string | null;
  category: string | null;
  size: string | null;
};

type PickHistory = {
  rawMaterialName: string | null;
  orderNo: string;
  styleNo: string;
  groupedQuantity: string;
  allocatedQuantity: string;
  availableStock: string;
  requestedTotal: string;
  pickedTotal: string;
  records: PickHistoryRecord[];
};

const reportFields: Array<{ key: keyof AllocationRow; label: string }> = [
  { key: "grnNumber", label: "GRN No" },
  { key: "purchaseOrderNumber", label: "Purchase Order" },
  { key: "masterGroupingNumber", label: "Master Group" },
  { key: "rawMaterialName", label: "Raw Material" },
  { key: "groupingNumber", label: "Grouping No" },
  { key: "totalGroupedQty", label: "Total Grouped Qty" },
  { key: "verificationAllocated", label: "Verification Allocated" },
  { key: "balanceToAllocate", label: "Balance to Allocate" },
];

const allocationDetailFields: Array<{ key: keyof AllocationDetailRow; label: string }> = [
  { key: "grnNumber", label: "GRN No" },
  { key: "purchaseOrderNumber", label: "Purchase Order" },
  { key: "orderNo", label: "Order No" },
  { key: "styleNo", label: "Style No" },
  { key: "pickedQuantity", label: "Picked Qty" },
  { key: "balanceStock", label: "Balance Stock" },
  { key: "alreadyAllocated", label: "Already Allocated" },
  { key: "balanceToAllocate", label: "Balance To Allocate" },
  { key: "grouped", label: "Grouped" },
  { key: "allocate", label: "Allocate" },
];

type AllocationField = (typeof reportFields)[number]["key"];

type AllocationLine = {
  groupedPurchaseOrderLineId: string;
  orderNo: string;
  styleNo: string;
  alreadyAllocated: number | string;
  balanceToAllocate: number | string;
  grouped: number | string;
  allocate: number | string;
  maxAllocatable: number | string;
};

const quantity = (value: number | string) => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function GrnAllocationReportPage({
  title = "GRN Allocation Report",
  allocationDetailsOnly = false,
}: {
  title?: string;
  allocationDetailsOnly?: boolean;
}) {
  return (
    <Suspense fallback={<UiPage as="div"><Section><Card>Loading inventory records...</Card></Section></UiPage>}>
      <GrnAllocationReportContent title={title} allocationDetailsOnly={allocationDetailsOnly} />
    </Suspense>
  );
}

function GrnAllocationReportContent({
  title,
  allocationDetailsOnly,
}: {
  title: string;
  allocationDetailsOnly: boolean;
}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const pickedHistoryLineId = allocationDetailsOnly ? searchParams.get("groupedPurchaseOrderLineId") ?? "" : "";
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn`;
  const [records, setRecords] = useState<AllocationRow[]>([]);
  const [allocationDetailRecords, setAllocationDetailRecords] = useState<AllocationDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const initialFields = allocationDetailsOnly ? allocationDetailFields : reportFields;
  const [visibleFields, setVisibleFields] = useState<string[]>(() => initialFields.map((field) => field.key));
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AllocationRow | null>(null);
  const [allocationForm, setAllocationForm] = useState({
    groupingPurchaseRequest: "",
    verificationAllocated: "",
    allocatedQty: "",
    grnVerificationSubformId: "",
    gateEntryNo: "",
    grnVerification: "",
  });
  const [allocationLines, setAllocationLines] = useState<AllocationLine[]>([]);
  const [allocationError, setAllocationError] = useState("");
  const [allocationLinesLoading, setAllocationLinesLoading] = useState(false);
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [allocationSuccess, setAllocationSuccess] = useState("");
  const [pickHistoryState, setPickHistoryState] = useState<{
    lineId: string;
    data?: PickHistory;
    error?: string;
  } | null>(null);

  const loadGroupedOrderLines = async (row: AllocationRow) => {
    setAllocationLinesLoading(true);
    try {
      const response = await fetch(`/api/inventory/grn-order-allocations?organizationId=${encodeURIComponent(organizationId)}&allocationId=${encodeURIComponent(row.id)}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load grouped order lines.");
      const lines = Array.isArray(data.lines) ? data.lines as AllocationLine[] : [];
      setAllocationLines(lines);
      if (lines.length === 0) setAllocationError("No grouped order lines are available for this GRN allocation.");
    } catch (loadError) {
      setAllocationLines([]);
      setAllocationError(loadError instanceof Error ? loadError.message : "Unable to load grouped order lines.");
    } finally {
      setAllocationLinesLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const sampleFilter = allocationDetailsOnly ? "&styleWiseInventory=true" : "";
    void fetch(`/api/inventory/grn-verifications?organizationId=${encodeURIComponent(organizationId)}&allocationRegister=true${sampleFilter}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load GRN allocations.");
        const allocationRows = Array.isArray(data.allocations) ? data.allocations as AllocationRow[] : [];
        setRecords(allocationRows);

        if (allocationDetailsOnly) {
          const detailRows = allocationRows.flatMap((row) =>
            row.orderAllocations.map((line): AllocationDetailRow => ({
              id: `${row.id}-${line.groupedPurchaseOrderLineId}`,
              grnNumber: row.grnNumber,
              purchaseOrderNumber: row.purchaseOrderNumber,
              orderNo: line.orderNo,
              styleNo: line.styleNo,
              groupedPurchaseOrderLineId: line.groupedPurchaseOrderLineId,
              pickedQuantity: line.pickedQuantity,
              balanceStock: line.balanceStock,
              alreadyAllocated: line.alreadyAllocated,
              balanceToAllocate: line.balanceToAllocate,
              grouped: line.grouped,
              allocate: line.allocate,
            })),
          );
          setAllocationDetailRecords(detailRows);
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load GRN allocations.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [allocationDetailsOnly, organizationId]);

  useEffect(() => {
    if (!pickedHistoryLineId) return;
    const controller = new AbortController();
    void fetch(
      `/api/inventory/raw-material-outward?organizationId=${encodeURIComponent(organizationId)}&groupedPurchaseOrderLineId=${encodeURIComponent(pickedHistoryLineId)}`,
      { cache: "no-store", signal: controller.signal },
    ).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load picked-material history.");
      setPickHistoryState({ lineId: pickedHistoryLineId, data: data.pickHistory as PickHistory });
    }).catch((loadError) => {
      if (!controller.signal.aborted) {
        setPickHistoryState({
          lineId: pickedHistoryLineId,
          error: loadError instanceof Error ? loadError.message : "Unable to load picked-material history.",
        });
      }
    });
    return () => controller.abort();
  }, [organizationId, pickedHistoryLineId]);
  const pickHistory = pickHistoryState?.lineId === pickedHistoryLineId ? pickHistoryState.data ?? null : null;
  const pickHistoryError = pickHistoryState?.lineId === pickedHistoryLineId ? pickHistoryState.error ?? "" : "";
  const pickHistoryLoading = Boolean(pickedHistoryLineId) && !pickHistory && !pickHistoryError;

  const openAllocationModal = (recordId: string) => {
    const row = records.find((record) => record.id === recordId);
    if (!row) return;
    setSelectedRow(row);
    setAllocationForm({
      groupingPurchaseRequest: row.groupingNumber,
      verificationAllocated: String(row.verificationAllocated ?? "0"),
      allocatedQty: String(row.verificationAllocated ?? "0"),
      grnVerificationSubformId: row.verificationId,
      gateEntryNo: row.grnNumber,
      grnVerification: row.verificationId,
    });
    setAllocationError("");
    setAllocationSuccess("");
    setAllocationLines([]);
    void loadGroupedOrderLines(row);
    setModalOpen(true);
  };

  const closeAllocationModal = () => {
    setModalOpen(false);
    setSelectedRow(null);
    setAllocationError("");
  };

  const handleAllocationLineChange = (index: number, key: keyof AllocationLine, value: string) => {
    setAllocationLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      if (key !== "allocate") {
        return line;
      }

      const parsedValue = Number(value || 0);
      const lineLimit = Number(line.maxAllocatable || 0);
      const nextValue = Number.isFinite(parsedValue) ? Math.min(Math.max(parsedValue, 0), lineLimit) : 0;
      return {
        ...line,
        [key]: nextValue,
        balanceToAllocate: Math.max(lineLimit - nextValue, 0),
      } as AllocationLine;
    }));
  };

  const handleSaveAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRow) return;

    const totalAllocated = allocationLines.reduce((sum, line) => sum + Number(line.allocate || 0), 0);
    const allowed = Number(selectedRow.verificationAllocated || 0);
    if (totalAllocated > allowed) {
      setAllocationError(`Total allocated quantity cannot exceed ${quantity(allowed)}.`);
      return;
    }

    setAllocationSaving(true);
    setAllocationError("");
    try {
      const response = await fetch("/api/inventory/grn-order-allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          allocationId: selectedRow.id,
          lines: allocationLines.map((line) => ({
            groupedPurchaseOrderLineId: line.groupedPurchaseOrderLineId,
            allocatedQuantity: line.allocate,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to save GRN order allocation.");

      closeAllocationModal();
      setAllocationSuccess("Allocation saved successfully.");
      try {
        const refreshResponse = await fetch(`/api/inventory/grn-verifications?organizationId=${encodeURIComponent(organizationId)}&allocationRegister=true`, {
          cache: "no-store",
        });
        const refreshData = await refreshResponse.json();
        if (!refreshResponse.ok) throw new Error(refreshData?.error || "Unable to refresh GRN allocations.");
        setRecords(Array.isArray(refreshData.allocations) ? refreshData.allocations as AllocationRow[] : []);
        setError("");
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : "Allocation saved, but the report could not be refreshed.");
      }
    } catch (saveError) {
      setAllocationError(saveError instanceof Error ? saveError.message : "Unable to save GRN order allocation.");
    } finally {
      setAllocationSaving(false);
    }
  };

  return (
    <UiPage as="div" className="px-1 py-1 sm:px-1 lg:px-1">
      <Section className="space-y-2">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1">
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          {!allocationDetailsOnly && (
            <nav className="flex items-center gap-2 text-xs font-semibold">
              <Link href={`${basePath}/report`} className="text-emerald-800 hover:text-emerald-950">GRN Report</Link>
              <Link href={`${basePath}/verification`} className="text-emerald-800 hover:text-emerald-950">Verification</Link>
              <Button type="button" variant="primary" size="sm" className="min-h-7 px-2 py-1 text-[11px]" onClick={() => router.push(`${basePath}/create`)}>
                Create GRN
              </Button>
            </nav>
          )}
        </header>

        {allocationSuccess && (
          <p role="status" aria-live="polite" className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-800">
            {allocationSuccess}
          </p>
        )}

        {loading ? (
          <div className="py-2 text-xs text-slate-500">{allocationDetailsOnly ? "Loading RM allocation details..." : "Loading GRN allocation report..."}</div>
        ) : error ? (
          <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>
        ) : (
          <div className="erp-surface overflow-hidden rounded-md">
            {allocationDetailsOnly && pickedHistoryLineId ? (
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="erp-eyebrow">Style-wise Inventory / Pick History</p>
                    <h2 className="erp-page-heading mt-1">{pickHistory?.rawMaterialName || "Raw material pick history"}</h2>
                    {pickHistory && (
                      <p className="mt-1 text-sm text-slate-500">
                        Order {pickHistory.orderNo} · Style {pickHistory.styleNo || "-"} · Grouped {quantity(pickHistory.groupedQuantity)} · Allocated {quantity(pickHistory.allocatedQuantity)}
                      </p>
                    )}
                  </div>
                  <Button type="button" variant="secondary" onClick={() => router.push(window.location.pathname)}>
                    Back to Style-wise Inventory
                  </Button>
                </div>
                {pickHistoryError && (
                  <Card role="alert" className="border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] text-sm text-[var(--erp-danger)]">
                    {pickHistoryError}
                  </Card>
                )}
                {pickHistoryLoading ? (
                  <Card className="text-sm text-slate-500">Loading picked-material history...</Card>
                ) : pickHistory ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Card className="space-y-1 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance Stock</p>
                        <p className="text-2xl font-bold text-slate-950">{quantity(pickHistory.availableStock)}</p>
                        <p className="text-xs text-slate-500">Allocated quantity less picked quantity</p>
                      </Card>
                      <Card className="space-y-1 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Requested</p>
                        <p className="text-2xl font-bold text-slate-950">{quantity(pickHistory.requestedTotal)}</p>
                      </Card>
                      <Card className="space-y-1 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Picked</p>
                        <p className="text-2xl font-bold text-slate-950">{quantity(pickHistory.pickedTotal)}</p>
                      </Card>
                    </div>
                    <Card className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-slate-950">Picked History</h3>
                          <p className="mt-1 text-sm text-slate-500">Request and pick activity for this allocated material line.</p>
                        </div>
                        <Badge>{pickHistory.records.length} picked records</Badge>
                      </div>
                      {pickHistory.records.length === 0 ? (
                        <p className="text-sm text-slate-500">No picked quantities are recorded for this material yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1100px] text-left text-sm">
                            <thead className="erp-table-head">
                              <tr>
                                <th className="p-3">Order No.</th>
                                <th className="p-3">Style No.</th>
                                <th className="p-3">Work Order No.</th>
                                <th className="p-3">Requested By</th>
                                <th className="p-3 text-right">Requested Qty</th>
                                <th className="p-3">Picked By</th>
                                <th className="p-3">Picked At</th>
                                <th className="p-3 text-right">Picked Qty</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--erp-border)]">
                              {pickHistory.records.map((record) => (
                                <tr key={record.id}>
                                  <td className="p-3">{record.orderNo}</td>
                                  <td className="p-3">{record.styleNo || "-"}</td>
                                  <td className="p-3 font-semibold">{record.workOrderNo}</td>
                                  <td className="p-3">{record.requestedBy || "-"}</td>
                                  <td className="p-3 text-right">{quantity(record.requestedQuantity)}</td>
                                  <td className="p-3">{record.pickedBy || "-"}</td>
                                  <td className="p-3">{record.pickedAt ? new Date(record.pickedAt).toLocaleString("en-IN") : "-"}</td>
                                  <td className="p-3 text-right font-semibold">{quantity(record.pickedQuantity)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </Card>
                  </>
                ) : !pickHistoryError ? (
                  <Card role="alert" className="text-sm text-slate-500">Pick history is unavailable.</Card>
                ) : null}
              </div>
            ) : allocationDetailsOnly ? (
              <ReportGrid
                title="RM Allocation Details"
                records={allocationDetailRecords}
                fields={allocationDetailFields}
                visibleFields={visibleFields}
                onVisibleFieldsChange={(next) => setVisibleFields(next.map(String))}
                rowIdSelector={(row) => row.id}
                selectedIds={[]}
                selectable={false}
                storageKey={`rm-style-allocation-columns-${organizationId}`}
                onRecordClick={(row) => {
                  const query = new URLSearchParams({
                    organizationId,
                    groupedPurchaseOrderLineId: row.groupedPurchaseOrderLineId,
                  });
                  router.push(`${window.location.pathname}?${query.toString()}`);
                }}
                onRowClick={() => undefined}
                renderCell={(fieldKey, row) => {
                  if (["alreadyAllocated", "balanceToAllocate", "grouped", "allocate", "pickedQuantity", "balanceStock"].includes(fieldKey)) {
                    return quantity(row[fieldKey as keyof AllocationDetailRow] as number | string);
                  }
                  return String(row[fieldKey as keyof AllocationDetailRow] ?? "-");
                }}
                emptyMessage="No RM allocation details found."
              />
            ) : (
              <ReportGrid
                title="GRN Verification Subform"
                records={records}
                fields={reportFields}
                visibleFields={visibleFields}
                onVisibleFieldsChange={(next) => setVisibleFields(next.map(String))}
                rowIdSelector={(row) => row.id}
                selectedIds={[]}
                selectable={false}
                storageKey={`grn-allocation-columns-${organizationId}`}
                onRowAction={(recordId) => openAllocationModal(recordId)}
                rowActionLabel="Allocate to Order"
                onRowClick={() => undefined}
                renderCell={(fieldKey, row) => {
                  const field = fieldKey as AllocationField;
                  if (field === "totalGroupedQty" || field === "verificationAllocated" || field === "balanceToAllocate") {
                    return quantity(row[field]);
                  }
                  return String(row[field] ?? "-");
                }}
                emptyMessage="No GRN allocation records found."
              />
            )}
          </div>
        )}
      </Section>

      {!allocationDetailsOnly && <Modal open={modalOpen} onClose={() => { if (!allocationSaving) closeAllocationModal(); }} ariaLabelledBy="rm-allocation-dialog-title" size="xl" className="p-0">
        <form onSubmit={handleSaveAllocation}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">RM Allocation</p>
              <h2 id="rm-allocation-dialog-title" className="text-sm font-bold text-slate-900">Allocate to Order</h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={closeAllocationModal} disabled={allocationSaving} aria-label="Close RM allocation form">
              Close
            </Button>
          </div>

          <div className="max-h-[78vh] space-y-4 overflow-y-auto p-4">
            {allocationError && (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {allocationError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Grouping Purchase Request"
                value={allocationForm.groupingPurchaseRequest}
                readOnly
                disabled
                className="h-9 text-[11px]"
              />
              <Input
                label="Verification Allocated"
                value={allocationForm.verificationAllocated}
                readOnly
                disabled
                className="h-9 text-[11px]"
              />
              <Input
                label="Allocated Qty"
                value={allocationForm.allocatedQty}
                readOnly
                disabled
                className="h-9 text-[11px]"
              />
              <Input
                label="Gate Entry No"
                value={allocationForm.gateEntryNo}
                readOnly
                disabled
                className="h-9 text-[11px]"
              />
              <Input
                label="GRN Verification Subform ID"
                value={allocationForm.grnVerificationSubformId}
                readOnly
                disabled
                className="h-9 text-[11px]"
              />
              <Input
                label="GRN Verification"
                value={allocationForm.grnVerification}
                readOnly
                disabled
                className="h-9 text-[11px]"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">RM Allocation Details</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-[11px]">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Order No</th>
                      <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Style No</th>
                      <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Already Allocated</th>
                      <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Balance To Allocate</th>
                      <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Grouped</th>
                      <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationLinesLoading ? (
                      <tr><td colSpan={6} className="px-2 py-4 text-center text-slate-500">Loading grouped order lines...</td></tr>
                    ) : allocationLines.map((line, index) => (
                      <tr key={`${line.orderNo}-${index}`} className="bg-white">
                        <td className="border-b border-slate-200 px-2 py-2">
                          <Select
                            value={line.orderNo}
                            disabled
                            className="h-8 text-[11px]"
                            options={line.orderNo ? [{ value: line.orderNo, label: line.orderNo }] : [{ value: "", label: "-" }]}
                          />
                        </td>
                        <td className="border-b border-slate-200 px-2 py-2">
                          <Input
                            value={line.styleNo}
                            readOnly
                            disabled
                            className="h-8 text-[11px]"
                          />
                        </td>
                        <td className="border-b border-slate-200 px-2 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={Number(line.alreadyAllocated || 0)}
                            readOnly
                            disabled
                            className="h-8 text-[11px]"
                          />
                        </td>
                        <td className="border-b border-slate-200 px-2 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={Number(line.balanceToAllocate || 0)}
                            readOnly
                            disabled
                            className="h-8 text-[11px]"
                          />
                        </td>
                        <td className="border-b border-slate-200 px-2 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={Number(line.grouped || 0)}
                            readOnly
                            disabled
                            className="h-8 text-[11px]"
                          />
                        </td>
                        <td className="border-b border-slate-200 px-2 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={Number(line.allocate || 0)}
                            onChange={(event) => handleAllocationLineChange(index, "allocate", event.target.value)}
                            max={Number(selectedRow?.verificationAllocated ?? 0)}
                            className="h-8 text-[11px]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <Button type="button" variant="secondary" size="sm" onClick={closeAllocationModal} disabled={allocationSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={allocationSaving || allocationLinesLoading || allocationLines.length === 0}>
              {allocationSaving ? "Saving..." : "Save Allocation"}
            </Button>
          </div>
        </form>
      </Modal>}
    </UiPage>
  );
}