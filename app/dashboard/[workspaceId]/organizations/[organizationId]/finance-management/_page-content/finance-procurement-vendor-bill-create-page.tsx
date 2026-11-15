"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";

type PurchaseOrderOption = {
  id: string;
  purchaseOrderNumber: string;
  entityId: string;
  entityName: string;
  vendorId: string;
  vendorName: string;
};

type ReceiptLine = {
  purchaseOrderLineId: string;
  inventoryReceiptLineId: string;
  inventoryReceiptId: string;
  receiptNumber: string;
  description: string;
  orderedQuantity: string;
  acceptedQuantity: string;
  availableQuantity: string;
  unitRate: string | null;
  unitOfMeasure: string | null;
};

export default function FinanceProcurementVendorBillCreatePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingLines, setLoadingLines] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receiptRequestId = useRef(0);
  const financeHome = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management`;
  const listHref = `${financeHome}/procurement-bills`;
  const api = useMemo(
    () => `/api/organizations/${encodeURIComponent(organizationId)}/finance/procurement-bills`,
    [organizationId],
  );

  const loadPurchaseOrders = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${api}/sources`, { signal, cache: "no-store" });
      const result = await response.json() as { purchaseOrders?: PurchaseOrderOption[]; error?: string };
      if (!response.ok || !Array.isArray(result.purchaseOrders)) {
        throw new Error(result.error ?? "Unable to load approved Purchase Orders.");
      }
      setPurchaseOrders(result.purchaseOrders);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unable to load approved Purchase Orders.");
    } finally {
      if (!signal?.aborted) setLoadingOrders(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/sources`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { purchaseOrders?: PurchaseOrderOption[]; error?: string };
        if (!response.ok || !Array.isArray(result.purchaseOrders)) {
          throw new Error(result.error ?? "Unable to load approved Purchase Orders.");
        }
        setPurchaseOrders(result.purchaseOrders);
        setError(null);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load approved Purchase Orders.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOrders(false);
      });
    return () => controller.abort();
  }, [api]);

  const selectedOrder = useMemo(
    () => purchaseOrders.find((order) => order.id === purchaseOrderId) ?? null,
    [purchaseOrders, purchaseOrderId],
  );

  const loadReceiptLines = useCallback(async (id: string) => {
    const requestId = ++receiptRequestId.current;
    setReceiptLines([]);
    setQuantities({});
    if (!id) {
      setLoadingLines(false);
      return;
    }
    setLoadingLines(true);
    setError(null);
    try {
      const response = await fetch(`${api}/sources?purchaseOrderId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json() as { lines?: ReceiptLine[]; error?: string };
      if (!response.ok || !Array.isArray(result.lines)) {
        throw new Error(result.error ?? "Unable to load accepted GRN lines.");
      }
      if (receiptRequestId.current === requestId) setReceiptLines(result.lines);
      if (receiptRequestId.current === requestId) setError(null);
    } catch (cause) {
      if (receiptRequestId.current === requestId) {
        setError(cause instanceof Error ? cause.message : "Unable to load accepted GRN lines.");
      }
    } finally {
      if (receiptRequestId.current === requestId) setLoadingLines(false);
    }
  }, [api]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const lines = receiptLines
      .filter((line) => quantities[line.inventoryReceiptLineId]?.trim() && quantities[line.inventoryReceiptLineId] !== "0")
      .map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        inventoryReceiptLineId: line.inventoryReceiptLineId,
        quantity: quantities[line.inventoryReceiptLineId],
      }));
    if (!purchaseOrderId || !invoiceNumber.trim() || !billDate || lines.length === 0) {
      setError("Select a Purchase Order, enter the vendor invoice number and date, and enter at least one billed quantity.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId,
          vendorInvoiceNumber: invoiceNumber,
          billDate,
          lines,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to create procurement vendor bill.");
      router.replace(listHref);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create procurement vendor bill.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header>
          <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance Management</p>
          <h1 className="mt-1 text-2xl font-semibold">New procurement vendor bill</h1>
          <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Bill only quantities accepted on posted GRNs. Rates and tax come from the approved Purchase Order.</p>
        </header>
        {error && (
          <div className="space-y-2">
            <p role="alert" className="text-sm font-medium text-[var(--erp-danger)]">{error}</p>
            {purchaseOrderId && !loadingLines && receiptLines.length === 0 && (
              <Button variant="outline" onClick={() => void loadReceiptLines(purchaseOrderId)}>Retry GRN lookup</Button>
            )}
            {!purchaseOrderId && !loadingOrders && purchaseOrders.length === 0 && (
              <Button variant="outline" onClick={() => {
                setLoadingOrders(true);
                void loadPurchaseOrders();
              }}>Retry Purchase Order lookup</Button>
            )}
          </div>
        )}
        <form className="space-y-6" onSubmit={(event) => void submit(event)}>
          <Card className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Approved Purchase Order"
                required
                value={purchaseOrderId}
                disabled={loadingOrders || submitting}
                onChange={(event) => {
                  const id = event.target.value;
                  setPurchaseOrderId(id);
                  void loadReceiptLines(id);
                }}
                options={[
                  { value: "", label: loadingOrders ? "Loading Purchase Orders…" : "Select Purchase Order" },
                  ...purchaseOrders.map((order) => ({
                    value: order.id,
                    label: `${order.purchaseOrderNumber} — ${order.vendorName} / ${order.entityName}`,
                  })),
                ]}
              />
              <Input
                label="Vendor invoice number"
                required
                maxLength={120}
                value={invoiceNumber}
                disabled={submitting}
                onChange={(event) => setInvoiceNumber(event.target.value)}
              />
              <Input
                label="Bill date"
                type="date"
                required
                value={billDate}
                disabled={submitting}
                onChange={(event) => setBillDate(event.target.value)}
              />
              {selectedOrder && (
                <div className="text-sm">
                  <p className="font-medium">{selectedOrder.vendorName}</p>
                  <p className="text-[var(--erp-text-muted)]">{selectedOrder.entityName}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Accepted GRN quantities</h2>
              <p className="mt-1 text-sm text-[var(--erp-text-muted)]">Enter the quantity billed from each GRN line. Server-side validation enforces both GRN and Purchase Order balances.</p>
            </div>
            {loadingLines ? (
              <p role="status" className="text-sm text-[var(--erp-text-muted)]">Loading accepted receipt lines…</p>
            ) : receiptLines.length === 0 ? (
              <p className="text-sm text-[var(--erp-text-muted)]">
                {purchaseOrderId ? "No unbilled accepted quantities are available for this Purchase Order." : "Select a Purchase Order to load posted GRN lines."}
              </p>
            ) : (
              <div className="space-y-4">
                {receiptLines.map((line) => (
                  <div key={line.inventoryReceiptLineId} className="grid gap-4 rounded-xl border border-[var(--erp-border)] p-4 md:grid-cols-[minmax(0,1fr)_12rem]">
                    <div className="min-w-0">
                      <p className="font-medium">{line.description}</p>
                      <p className="mt-1 text-sm text-[var(--erp-text-muted)]">
                        GRN {line.receiptNumber} · Accepted {line.acceptedQuantity} {line.unitOfMeasure ?? ""} · Available {line.availableQuantity} · Rate {line.unitRate ?? "—"}
                      </p>
                    </div>
                    <Input
                      label="Billed quantity"
                      type="number"
                      min="0"
                      max={line.availableQuantity}
                      step="0.0001"
                      value={quantities[line.inventoryReceiptLineId] ?? ""}
                      disabled={submitting}
                      onChange={(event) => setQuantities((current) => ({
                        ...current,
                        [line.inventoryReceiptLineId]: event.target.value,
                      }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={submitting || loadingOrders || loadingLines}>
              {submitting ? "Saving…" : "Save draft bill"}
            </Button>
            <Link href={listHref}><Button type="button" variant="outline">Cancel</Button></Link>
          </div>
        </form>
      </Section>
    </Page>
  );
}
