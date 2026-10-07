"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import { calculateWorkOrderGrnVerificationSplit } from "@/lib/services/inventory/work-order-grn-validation";
import { flattenWorkOrderGrnVerificationTasks } from "@/lib/services/inventory/work-order-grn-verification";
import { allocateApprovedReceiptToBookingAssignments } from "@/lib/services/inventory/work-order-grn-booking-allocation";

type WorkOrderGrnLine = {
  id: string;
  workOrderSizeLineId: string;
  size: string | null;
  buyerSize: string | null;
  orderedQuantity: number;
  availableQuantity: number;
  receivedQuantity: number;
  verifiedActualQuantity: number | null;
  approvedQuantity: number | null;
  rejectedQuantity: number | null;
  advanceBookedQuantity: number | null;
  generalInventoryQuantity: number | null;
  bookingAssignments: Array<{
    assignmentId: string;
    bookingNo: string;
    size: string;
    assignedQuantity: number;
    fulfilledQuantity: number;
  }>;
};

type WorkOrderGrnRecord = {
  id: string;
  grnNo: string;
  receivedDate: string;
  status: string;
  notes: string;
  createdAt: string;
  workOrder: {
    id: string;
    workOrderNo: string;
    orderNo: string;
    totalQty: number;
    status: string;
    article: string | null;
    styleName: string | null;
    brand: string | null;
    locations: Array<{ id: string; location_name: string }>;
  };
  lines: WorkOrderGrnLine[];
};

type VerificationInput = {
  actualReceivedQuantity: string;
  approvedQuantity: string;
  locationId: string;
};

type ReportRecord = {
  id: string;
  line: WorkOrderGrnLine;
  grnId: string;
  size: string;
  workOrderNo: string;
  orderNo: string;
  style: string;
  grnNo: string;
  receivedDate: string;
  orderedQuantity: number;
  receivedQuantity: number;
  status: string;
  locations: Array<{ id: string; location_name: string }>;
};

type ReportField =
  | "grnNo"
  | "workOrderNo"
  | "orderNo"
  | "style"
  | "size"
  | "orderedQuantity"
  | "receivedQuantity"
  | "receivedDate"
  | "status";

const reportFields: Array<{ key: ReportField; label: string }> = [
  { key: "grnNo", label: "GRN No" },
  { key: "workOrderNo", label: "Work Order No" },
  { key: "orderNo", label: "Order No" },
  { key: "style", label: "Style" },
  { key: "size", label: "Size" },
  { key: "orderedQuantity", label: "Work Order Qty" },
  { key: "receivedQuantity", label: "Submitted Qty" },
  { key: "receivedDate", label: "Received Date" },
  { key: "status", label: "Status" },
];

function parseQuantity(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

export default function WorkOrderGrnVerificationPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params.workspaceId}/organizations/${organizationId}/inventory-management/inward/wo-grn`;
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [visibleFields, setVisibleFields] = useState<ReportField[]>(reportFields.map(({ key }) => key));
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<ReportRecord | null>(null);
  const [verificationInputs, setVerificationInputs] = useState<Record<string, VerificationInput>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingVerification, setSavingVerification] = useState(false);
  const [error, setError] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPendingGrns = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, status: "PENDING_VERIFICATION", limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/inventory/work-order-grns?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.grns)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load Work Order GRN verification tasks.");
      }
      const page = flattenWorkOrderGrnVerificationTasks(data.grns as WorkOrderGrnRecord[]);
      setRecords((current) => cursor ? [...current, ...page] : page);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Work Order GRN verification tasks.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadPendingGrns();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadPendingGrns]);

  const modalRows = useMemo(() => {
    if (!activeTask) return [];
    const { line } = activeTask;
    const value = verificationInputs[line.id] ?? {
      actualReceivedQuantity: String(line.receivedQuantity),
      approvedQuantity: String(line.receivedQuantity),
      locationId: activeTask.locations.length === 1 ? activeTask.locations[0].id : "",
    };
    const actual = parseQuantity(value.actualReceivedQuantity);
    const approved = parseQuantity(value.approvedQuantity);
    let advanceBooked = 0;
    let bookingAllocations: ReturnType<typeof allocateApprovedReceiptToBookingAssignments> | null = null;
    let split: { rejectedQuantity: number; generalInventoryQuantity: number } | null = null;
    let validationError = "";

    if (actual === null || approved === null) {
      validationError = "Enter whole-number quantities.";
    } else if (actual > line.receivedQuantity) {
      validationError = "Actual received quantity cannot exceed the quantity submitted on this GRN line.";
    } else {
      try {
        bookingAllocations = allocateApprovedReceiptToBookingAssignments(approved, line.bookingAssignments);
        advanceBooked = bookingAllocations.allocations.reduce((sum, allocation) => sum + allocation.allocatedQuantity, 0);
        split = calculateWorkOrderGrnVerificationSplit({
          actualReceivedQuantity: actual,
          approvedQuantity: approved,
          advanceBookedQuantity: advanceBooked,
        });
      } catch (quantityError) {
        validationError = quantityError instanceof Error ? quantityError.message : "Check the quantity split.";
      }
    }

    return [{ line, value, actual, approved, advanceBooked, split, bookingAllocations, validationError }];
  }, [activeTask, verificationInputs]);

  function openVerification(task: ReportRecord) {
    setVerificationError("");
    setSuccessMessage("");
    setActiveTask(task);
    setVerificationInputs({
      [task.line.id]: {
        actualReceivedQuantity: String(task.line.receivedQuantity),
        approvedQuantity: String(task.line.receivedQuantity),
        locationId: task.locations.length === 1 ? task.locations[0].id : "",
      },
    });
  }

  function updateVerificationInput(lineId: string, field: keyof VerificationInput, value: string) {
    if (value !== "" && !/^\d+$/.test(value)) return;
    setVerificationInputs((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ?? { actualReceivedQuantity: "0", approvedQuantity: "0", locationId: "" }),
        [field]: value,
      },
    }));
  }

  function updateVerificationLocation(lineId: string, locationId: string) {
    setVerificationInputs((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ?? { actualReceivedQuantity: "0", approvedQuantity: "0", locationId: "" }),
        locationId,
      },
    }));
  }

  const hasMissingStockLocation = modalRows.some(({ value, approved }) =>
    approved !== null && approved > 0 && !value.locationId,
  );
  const hasInvalidSplit = modalRows.some((row) => row.validationError !== "") || hasMissingStockLocation;

  async function submitVerification() {
    if (!activeTask || hasInvalidSplit || savingVerification) return;
    const value = verificationInputs[activeTask.line.id];
    if (!value) return;
    const actualReceivedQuantity = parseQuantity(value.actualReceivedQuantity);
    const approvedQuantity = parseQuantity(value.approvedQuantity);
    if (actualReceivedQuantity === null || approvedQuantity === null) return;
    setSavingVerification(true);
    setVerificationError("");
    try {
      const response = await fetch(
        `/api/inventory/work-order-grns/${encodeURIComponent(activeTask.grnId)}/lines/${encodeURIComponent(activeTask.line.id)}/verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            actualReceivedQuantity,
            approvedQuantity,
            locationId: value.locationId,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Unable to save Work Order GRN verification.");
      const allocatedQuantity = Number(data.advanceBookedQuantity ?? 0);
      const generalQuantity = Number(data.generalInventoryQuantity ?? 0);
      const rejectedQuantity = Number(data.rejectedQuantity ?? 0);
      setSuccessMessage(
        `GRN ${activeTask.grnNo} verified. Approved: ${approvedQuantity}; allocated stock: ${allocatedQuantity}; general stock: ${generalQuantity}; rejected: ${rejectedQuantity}.`,
      );
      setRecords((current) => current.filter((record) => record.id !== activeTask.id));
      setActiveTask(null);
      await loadPendingGrns();
    } catch (saveError) {
      setVerificationError(saveError instanceof Error ? saveError.message : "Unable to save Work Order GRN verification.");
    } finally {
      setSavingVerification(false);
    }
  }

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Inward</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Work Order GRN Verification</h1>
            <p className="mt-1 text-sm text-slate-600">Review each received size line and post its approved split to finished-goods stock.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => router.push(`${basePath}/report`)}>GRN Report</Button>
            <Button variant="secondary" onClick={() => void loadPendingGrns()} disabled={loading}>Refresh</Button>
          </div>
        </header>

        {error ? (
          <Card role="alert" className="space-y-3">
            <p className="text-sm text-slate-700">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void loadPendingGrns()} disabled={loading}>Retry</Button>
          </Card>
        ) : null}
        {successMessage ? (
          <Card role="status">
            <p className="text-sm text-slate-700">{successMessage}</p>
          </Card>
        ) : null}
        {loading ? <p role="status" className="text-sm text-slate-600">Loading pending verification tasks...</p> : null}
        <Card className="p-2 shadow-none">
          <ReportGrid
            title="Pending Work Order GRN Lines"
            records={records}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(fields) => setVisibleFields(fields as ReportField[])}
            storageKey={`work-order-grn-verification-columns:${organizationId}`}
            rowIdSelector={(record) => record.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={(recordId) => {
              const task = records.find((record) => record.id === recordId);
              if (task) openVerification(task);
            }}
            onRowAction={(recordId) => {
              const task = records.find((record) => record.id === recordId);
              if (task) openVerification(task);
            }}
            rowActionLabel="Approve"
            renderCell={(fieldKey, record) => {
              if (fieldKey === "receivedDate") return record.receivedDate;
              const value = record[fieldKey as keyof ReportRecord];
              return value === null || value === undefined ? "" : String(value);
            }}
            emptyMessage="No Work Order GRNs are waiting for verification."
          />
          {nextCursor ? (
            <div className="flex justify-center p-3">
              <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void loadPendingGrns(nextCursor)}>
                {loadingMore ? "Loading verification tasks..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </Card>
      </Section>

      <Modal
        open={activeTask !== null}
        onClose={() => setActiveTask(null)}
        ariaLabelledBy="work-order-grn-verify-title"
        ariaDescribedBy="work-order-grn-verify-description"
        size="xl"
        className="sm:max-w-6xl"
      >
        {activeTask ? (
          <div className="space-y-4 p-6">
            <header className="space-y-1">
              <h2 id="work-order-grn-verify-title" className="text-xl font-semibold text-slate-900">Approve Work Order GRN Line</h2>
              <p id="work-order-grn-verify-description" className="text-sm text-slate-600">
                {activeTask.grnNo} · {activeTask.workOrderNo} · {activeTask.orderNo} · Size {activeTask.size}
              </p>
            </header>
            <p className="rounded-md border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-3 py-2 text-sm text-slate-700">
              Enter actual and approved quantities, then select the finished-goods location. Verification posts booking-allocated and general stock separately and records rejected quantity atomically.
            </p>
            {verificationError ? (
              <Card role="alert">
                <p className="text-sm text-slate-700">{verificationError}</p>
              </Card>
            ) : null}
            <Select
              label="Finished Goods Location"
              value={verificationInputs[activeTask.line.id]?.locationId ?? ""}
              onChange={(event) => updateVerificationLocation(activeTask.line.id, event.target.value)}
              disabled={activeTask.locations.length === 0}
              options={[
                { value: "", label: activeTask.locations.length === 0 ? "No active location for this order entity" : "Select location" },
                ...activeTask.locations.map((location) => ({ value: location.id, label: location.location_name })),
              ]}
            />
            {activeTask.locations.length === 0 ? (
              <p role="alert" className="text-sm text-slate-700">An active location must be configured under this order&apos;s entity before approved stock can be posted.</p>
            ) : null}
            {modalRows.map(({ line, value, advanceBooked, split, bookingAllocations }) => (
              <section key={line.id} aria-label={`Verification quantities for size ${line.size || line.buyerSize || "unspecified"}`} className="space-y-4 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4 sm:p-6">
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-slate-600">Work Order Qty</p>
                    <p className="text-lg font-semibold text-slate-900">{line.orderedQuantity}</p>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-slate-600">Submitted Qty</p>
                    <p className="text-lg font-semibold text-slate-900">{line.receivedQuantity}</p>
                  </div>
                  <label className="min-w-0 space-y-2 text-sm font-medium text-slate-600">
                    Actual Received
                    <Input
                      type="number"
                      min={0}
                      max={line.receivedQuantity}
                      step={1}
                      value={value.actualReceivedQuantity}
                      onChange={(event) => updateVerificationInput(line.id, "actualReceivedQuantity", event.target.value)}
                      aria-label={`Actual received quantity for ${line.size || line.buyerSize || "unspecified"}`}
                    />
                  </label>
                  <label className="min-w-0 space-y-2 text-sm font-medium text-slate-600">
                    Approved Qty
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={value.approvedQuantity}
                      onChange={(event) => updateVerificationInput(line.id, "approvedQuantity", event.target.value)}
                      aria-label={`Approved quantity for ${line.size || line.buyerSize || "unspecified"}`}
                    />
                  </label>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-slate-600">Rejected Qty</p>
                    <p className="text-lg font-semibold text-slate-900">{split?.rejectedQuantity ?? "—"}</p>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <label htmlFor={`advance-booked-${line.id}`} className="block text-sm font-medium text-slate-600">
                      Advance-Booked Qty
                    </label>
                    <Input
                      id={`advance-booked-${line.id}`}
                      type="number"
                      min={0}
                      step={1}
                      value={advanceBooked}
                      readOnly
                      aria-label={`Advance-booked quantity for ${line.size || line.buyerSize || "unspecified"}`}
                      hint="Assigned booking balances are fulfilled only when verification is saved."
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-slate-600">General Inventory Qty</p>
                    <p className="text-lg font-semibold text-slate-900">{bookingAllocations?.generalInventoryQuantity ?? "—"}</p>
                  </div>
                </div>
                <div className="space-y-2 border-t border-[var(--erp-border)] pt-4">
                  <h3 className="text-sm font-semibold text-slate-800">Assigned advance bookings for this work-order size</h3>
                  {bookingAllocations?.allocations.length ? (
                    <div className="max-w-full overflow-x-auto rounded-lg border border-[var(--erp-border)] bg-white">
                      <table className="w-full min-w-[32rem] text-left text-sm">
                        <thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-xs font-semibold uppercase text-slate-600">
                          <tr>
                            <th scope="col" className="px-3 py-2">Booking ID</th>
                            <th scope="col" className="px-3 py-2">Size</th>
                            <th scope="col" className="px-3 py-2">Remaining Assigned Qty</th>
                            <th scope="col" className="px-3 py-2">This GRN Preview</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--erp-border)]">
                          {bookingAllocations.allocations.map((allocation) => (
                            <tr key={allocation.assignmentId}>
                              <td className="px-3 py-2 font-medium text-slate-800">{allocation.bookingNo}</td>
                              <td className="px-3 py-2">{allocation.size}</td>
                              <td className="px-3 py-2">{allocation.remainingQuantity}</td>
                              <td className="px-3 py-2">{allocation.allocatedQuantity}</td>
                            </tr>
                          ))}
                          <tr className="font-medium">
                            <td className="px-3 py-2" colSpan={3}>General FG inventory</td>
                            <td className="px-3 py-2">{bookingAllocations.generalInventoryQuantity}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">No advance booking is assigned to this work-order size. Approved quantity remains for general FG inventory.</p>
                  )}
                </div>
              </section>
            ))}
            {hasInvalidSplit ? (
              <div role="alert" className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {modalRows.filter((row) => row.validationError).map(({ line, validationError }) => (
                  <p key={line.id}>{line.size || line.buyerSize || "Size"}: {validationError}</p>
                ))}
                {hasMissingStockLocation ? <p>Select a finished-goods location to post the approved quantity.</p> : null}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
              <Button variant="secondary" onClick={() => setActiveTask(null)} disabled={savingVerification}>Close</Button>
              <Button type="button" disabled={hasInvalidSplit || savingVerification} onClick={() => void submitVerification()}>
                {savingVerification ? "Verifying and posting..." : "Verify & Post Stock"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Page>
  );
}
