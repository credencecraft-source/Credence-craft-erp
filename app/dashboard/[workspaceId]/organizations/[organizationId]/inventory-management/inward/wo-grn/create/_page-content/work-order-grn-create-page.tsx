"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";

type WorkOrderSizeLine = {
  id: string;
  size: string | null;
  buyerSize: string | null;
  quantity: number;
  previouslyReceivedQuantity: number;
  availableQuantity: number;
};

type WorkOrderOption = {
  id: string;
  orderId: string;
  workOrderNo: string;
  orderNo: string;
  buyer: string | null;
  article: string | null;
  styleName: string | null;
  brand: string | null;
  totalQty: number;
  status: string;
  sizeLines: WorkOrderSizeLine[];
};

function todayLocalDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export default function WorkOrderGrnCreatePage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "";
  const grnPath = `/dashboard/${params.workspaceId}/organizations/${organizationId}/inventory-management/inward/wo-grn`;

  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, string>>({});
  const [receivedDate, setReceivedDate] = useState(todayLocalDate);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedWorkOrder = workOrders.find((workOrder) => workOrder.id === selectedWorkOrderId) ?? null;
  const totalReceived = useMemo(
    () => Object.values(receivedQuantities).reduce((total, value) => total + (Number(value) || 0), 0),
    [receivedQuantities],
  );

  const loadWorkOrders = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, workOrders: "true", limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/inventory/work-order-grns?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.workOrders)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load receivable work orders.");
      }
      setWorkOrders((current) => cursor ? [...current, ...data.workOrders] : data.workOrders);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load receivable work orders.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadWorkOrders();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadWorkOrders]);

  function handleWorkOrderChange(workOrderId: string) {
    setSelectedWorkOrderId(workOrderId);
    const workOrder = workOrders.find((record) => record.id === workOrderId);
    setReceivedQuantities(Object.fromEntries((workOrder?.sizeLines ?? []).map((line) => [line.id, "0"])));
    setError("");
  }

  function updateReceivedQuantity(line: WorkOrderSizeLine, value: string) {
    if (value !== "" && !/^\d+$/.test(value)) return;
    const quantity = Number(value || 0);
    if (quantity > line.availableQuantity) {
      setError(`Received quantity cannot exceed the remaining balance for ${line.size || line.buyerSize || "this size"}.`);
      return;
    }
    setError("");
    setReceivedQuantities((current) => ({ ...current, [line.id]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!selectedWorkOrder) {
      setError("Select a work order before submitting the GRN.");
      return;
    }
    if (!receivedDate) {
      setError("Enter the received date.");
      return;
    }
    if (!Number.isSafeInteger(totalReceived) || totalReceived <= 0) {
      setError("Enter a received quantity for at least one work-order size.");
      return;
    }
    if (selectedWorkOrder.sizeLines.some((line) => {
      const value = receivedQuantities[line.id] ?? "0";
      const quantity = Number(value);
      return !Number.isSafeInteger(quantity) || quantity < 0 || quantity > line.availableQuantity;
    })) {
      setError("One or more size quantities are invalid or exceed the remaining work-order balance.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/inventory/work-order-grns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          workOrderId: selectedWorkOrder.id,
          receivedDate,
          notes,
          lines: selectedWorkOrder.sizeLines.map((line) => ({
            workOrderSizeLineId: line.id,
            receivedQuantity: Number(receivedQuantities[line.id] ?? 0),
          })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.grn?.id) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to submit the Work Order GRN.");
      }
      router.push(`${grnPath}/verification`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit the Work Order GRN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-4">
        <Link href={`${grnPath}/report`} className="text-sm font-semibold text-[var(--erp-brand)]">
          &larr; Work Order GRN Report
        </Link>
        <header>
          <p className="erp-eyebrow">Inventory / Inward</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Create Work Order GRN</h1>
          <p className="mt-1 text-sm text-slate-600">Select a work order to load its header and size-wise receiving quantities.</p>
        </header>

        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        {loading && workOrders.length === 0 ? <p role="status" className="text-sm text-slate-600">Loading work orders...</p> : null}
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Work Order GRN Header</h2>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Select
                label="Work Order No"
                value={selectedWorkOrderId}
                onChange={(event) => handleWorkOrderChange(event.target.value)}
                required
                disabled={loading || saving || workOrders.length === 0}
                options={[
                  { value: "", label: loading ? "Loading work orders..." : "Select work order" },
                  ...workOrders.map((workOrder) => ({
                    value: workOrder.id,
                    label: `${workOrder.workOrderNo} · ${workOrder.orderNo}`,
                  })),
                ]}
              />
              <Input label="Order No" value={selectedWorkOrder?.orderNo ?? ""} readOnly />
              <Input label="Buyer" value={selectedWorkOrder?.buyer ?? ""} readOnly />
              <Input label="Article" value={selectedWorkOrder?.article ?? ""} readOnly />
              <Input label="Style" value={selectedWorkOrder?.styleName ?? ""} readOnly />
              <Input label="Brand" value={selectedWorkOrder?.brand ?? ""} readOnly />
              <Input label="Work Order Qty" value={selectedWorkOrder ? String(selectedWorkOrder.totalQty) : ""} readOnly />
              <Input label="Work Order Status" value={selectedWorkOrder?.status ?? ""} readOnly />
              <Input
                label="Received Date"
                type="date"
                value={receivedDate}
                onChange={(event) => setReceivedDate(event.target.value)}
                required
                disabled={saving}
              />
              <Input
                label="GRN Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
                disabled={saving}
              />
            </div>
            {nextCursor ? (
              <Button type="button" variant="secondary" size="sm" disabled={loadingMore || saving} onClick={() => void loadWorkOrders(nextCursor)}>
                {loadingMore ? "Loading work orders..." : "Load more work orders"}
              </Button>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Work Order Size Quantities</h2>
                <p className="mt-1 text-sm text-slate-600">Enter quantities received against each size. Existing GRNs reduce the available balance.</p>
              </div>
              <p className="text-sm font-semibold text-slate-700">Total received: {totalReceived}</p>
            </div>
            <div className="max-w-full overflow-x-auto rounded-lg border border-[var(--erp-border)]">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2">Size</th>
                    <th scope="col" className="px-3 py-2">Work Order Qty</th>
                    <th scope="col" className="px-3 py-2">Previously Received</th>
                    <th scope="col" className="px-3 py-2">Balance</th>
                    <th scope="col" className="px-3 py-2">Received Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {!selectedWorkOrder ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Select a work order to load size quantities.</td></tr>
                  ) : selectedWorkOrder.sizeLines.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">The selected work order has no size lines.</td></tr>
                  ) : selectedWorkOrder.sizeLines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">{line.size || line.buyerSize || "Unspecified"}</td>
                      <td className="px-3 py-2 text-slate-700">{line.quantity}</td>
                      <td className="px-3 py-2 text-slate-700">{line.previouslyReceivedQuantity}</td>
                      <td className="px-3 py-2 text-slate-700">{line.availableQuantity}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={line.availableQuantity}
                          step={1}
                          value={receivedQuantities[line.id] ?? "0"}
                          onChange={(event) => updateReceivedQuantity(line, event.target.value)}
                          aria-label={`Received quantity for size ${line.size || line.buyerSize || "unspecified"}`}
                          disabled={!selectedWorkOrder || saving || line.availableQuantity === 0}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => router.push(`${grnPath}/report`)}>Cancel</Button>
              <Button type="submit" disabled={saving || !selectedWorkOrder || totalReceived <= 0}>
                {saving ? "Submitting GRN..." : "Submit Work Order GRN"}
              </Button>
            </div>
          </Card>
        </form>
      </Section>
    </Page>
  );
}
