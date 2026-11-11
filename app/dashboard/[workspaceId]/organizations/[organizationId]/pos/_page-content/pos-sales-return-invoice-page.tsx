"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import Textarea from "@/components/ui/Textarea";

type InvoiceLine = {
  id: string;
  stockType: string;
  styleName: string;
  orderNo: string;
  articleNo: string;
  size: string;
  colour: string;
  quantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitRate: string;
  gstRate: string;
  discountPercent: string;
  totalAmount: string;
};

type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  customerContactId: string | null;
  customerPhone: string;
  entityName: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  returnBlockedReason: string | null;
  lines: InvoiceLine[];
};

type Selection = { invoiceLineId: string; quantity: number };
type ReturnSettlement = "STORE_CREDIT" | "REFUND";
type RefundMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
}

async function readJson<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = typeof result === "object" && result !== null && "error" in result
      ? String(result.error)
      : "The request could not be completed.";
    throw new Error(message);
  }
  return result as T;
}

export default function PosSalesReturnInvoicePage({
  workspaceId,
  organizationId,
  invoiceNumber,
}: {
  workspaceId: string;
  organizationId: string;
  invoiceNumber: string;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("GOODS RETURNED BY CUSTOMER");
  const [settlementType, setSettlementType] = useState<ReturnSettlement>("STORE_CREDIT");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("UPI");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const requestKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const searchPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/sales-return`;
  const apiPath = `/api/organizations/${organizationId}/pos/sales-returns/invoices?invoiceNumber=${encodeURIComponent(invoiceNumber)}`;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath, { signal: controller.signal, cache: "no-store" })
      .then((response) => readJson<{ invoice: InvoiceRecord }>(response))
      .then((result) => {
        if (controller.signal.aborted) return;
        setInvoice(result.invoice);
        setQuantities({});
        setSettlementType(result.invoice.customerContactId ? "STORE_CREDIT" : "REFUND");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load invoice.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiPath]);

  const selectedLines = useMemo<Selection[]>(() => Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([invoiceLineId, quantity]) => ({ invoiceLineId, quantity })), [quantities]);
  const estimate = useMemo(() => {
    if (!invoice) return 0;
    return selectedLines.reduce((total, selection) => {
      const line = invoice.lines.find((item) => item.id === selection.invoiceLineId);
      return total + (line ? Number(line.totalAmount) * selection.quantity / line.quantity : 0);
    }, 0);
  }, [invoice, selectedLines]);

  const backToSearch = useCallback(() => router.push(searchPath), [router, searchPath]);

  const postReturn = async () => {
    if (!invoice || selectedLines.length === 0 || !reason.trim() || posting) return;
    setPosting(true);
    setError("");
    const signature = JSON.stringify({
      invoiceNumber: invoice.invoiceNumber,
      reason: reason.trim(),
      settlementType,
      refundMethod: settlementType === "REFUND" ? refundMethod : null,
      lines: selectedLines,
    });
    if (!requestKeyRef.current || requestKeyRef.current.signature !== signature) {
      requestKeyRef.current = { signature, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch(`/api/organizations/${organizationId}/pos/sales-returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          requestKey: requestKeyRef.current.key,
          reason: reason.trim(),
          settlementType,
          refundMethod: settlementType === "REFUND" ? refundMethod : null,
          lines: selectedLines,
        }),
      });
      const result = await readJson<{ salesReturn: { returnNumber: string } }>(response);
      router.push(`${searchPath}/records/${encodeURIComponent(result.salesReturn.returnNumber)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to post this return.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Point of Sale / Sales Return</p>
            <h1 className="erp-page-heading mt-1">Select returned items</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Choose quantities from the original invoice. Prices, tax, and stock values are taken from the posted sale.
            </p>
          </div>
          <Button variant="secondary" onClick={backToSearch}>
            <ArrowLeft aria-hidden="true" size={16} />
            Back to invoices
          </Button>
        </div>

        {loading ? (
          <Card aria-busy="true"><p className="text-sm text-[var(--erp-muted)]">Loading posted invoice…</p></Card>
        ) : error && !invoice ? (
          <Card className="space-y-4" role="alert">
            <p className="text-sm text-[var(--erp-danger)]">{error}</p>
            <Button variant="secondary" onClick={backToSearch}>Return to invoice search</Button>
          </Card>
        ) : invoice ? (
          <>
            <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="erp-eyebrow">Invoice</p><p className="mt-1 font-semibold">{invoice.invoiceNumber}</p></div>
              <div><p className="erp-eyebrow">Date</p><p className="mt-1 font-semibold">{formatDate(invoice.invoiceDate)}</p></div>
              <div><p className="erp-eyebrow">Customer</p><p className="mt-1 font-semibold">{invoice.customer || "Customer not linked"}</p><p className="text-sm text-[var(--erp-muted)]">{invoice.customerPhone}</p></div>
              <div><p className="erp-eyebrow">Invoice total</p><p className="mt-1 font-semibold">{formatMoney(invoice.totalAmount)}</p></div>
            </Card>

            {invoice.returnBlockedReason && (
              <Card className="border-[var(--erp-warning)]" role="status">
                <p className="text-sm text-[var(--erp-warning)]">{invoice.returnBlockedReason} Items without verified stock movement cannot be returned.</p>
              </Card>
            )}

            <Card className="space-y-4">
              <div>
                <h2 className="erp-card-title">Invoice items</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">Enter a whole quantity up to the remaining returnable amount.</p>
              </div>
              <Table>
                <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Item</th>
                    <th scope="col" className="px-4 py-3">Size / colour</th>
                    <th scope="col" className="px-4 py-3 text-right">Sold</th>
                    <th scope="col" className="px-4 py-3 text-right">Returned</th>
                    <th scope="col" className="px-4 py-3 text-right">Returnable</th>
                    <th scope="col" className="px-4 py-3 text-right">Unit rate</th>
                    <th scope="col" className="px-4 py-3">Return qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{line.styleName || line.articleNo || "Item"}</p>
                        <p className="text-xs text-[var(--erp-muted)]">{line.articleNo}{line.orderNo ? ` · ${line.orderNo}` : ""}</p>
                      </td>
                      <td className="px-4 py-3">{[line.size, line.colour].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.returnedQuantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.returnableQuantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.unitRate)}</td>
                      <td className="min-w-36 px-4 py-3">
                        <Input
                          aria-label={`Return quantity for ${line.styleName || line.articleNo || "item"} ${line.size}`}
                          type="number"
                          min={0}
                          max={line.returnableQuantity}
                          step={1}
                          value={quantities[line.id] ?? 0}
                          disabled={line.returnableQuantity === 0 || reviewing || posting}
                          onChange={(event) => {
                            const next = event.target.value === "" ? 0 : Number(event.target.value);
                            if (!Number.isInteger(next) || next < 0 || next > line.returnableQuantity) return;
                            setQuantities((current) => ({ ...current, [line.id]: next }));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="max-w-2xl">
                <Textarea
                  label="Return reason"
                  value={reason}
                  maxLength={1000}
                  disabled={reviewing || posting}
                  onChange={(event) => setReason(event.target.value)}
                  hint="This reason is recorded on the credit note."
                />
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <Card className="space-y-3">
                <h2 className="erp-card-title">Return summary</h2>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-[var(--erp-muted)]">Selected item lines</span>
                  <span className="font-semibold">{selectedLines.length}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-[var(--erp-border)] pt-3">
                  <span className="font-semibold">Estimated credit note</span>
                  <span className="font-semibold">{formatMoney(estimate)}</span>
                </div>
                <p className="text-xs text-[var(--erp-muted)]">Final tax and credit amounts are calculated from the original invoice by the server.</p>
              </Card>
              <Card className="flex flex-col justify-center gap-3">
                {reviewing ? (
                  <>
                    <Select
                      id="return-settlement-type"
                      label="Settlement"
                      value={settlementType}
                      disabled={posting}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        if (value === "STORE_CREDIT" || value === "REFUND") setSettlementType(value);
                      }}
                    >
                      {invoice.customerContactId && <option value="STORE_CREDIT">Store credit for a future invoice</option>}
                      <option value="REFUND">Refund customer</option>
                    </Select>
                    {settlementType === "REFUND" ? (
                      <Select
                        id="return-refund-method"
                        label="Refund method"
                        value={refundMethod}
                        disabled={posting}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          if (value === "CASH" || value === "UPI" || value === "CARD"
                            || value === "BANK_TRANSFER" || value === "OTHER") {
                            setRefundMethod(value);
                          }
                        }}
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="OTHER">Other</option>
                      </Select>
                    ) : (
                      <p className="text-xs text-[var(--erp-muted)]">
                        Credit stays with this registered customer and can be applied to a later POS invoice.
                      </p>
                    )}
                    <p className="text-sm">Confirm return of <strong>{selectedLines.reduce((sum, line) => sum + line.quantity, 0)}</strong> item(s) for an estimated credit of <strong>{formatMoney(estimate)}</strong>?</p>
                    <Button
                      onClick={() => void postReturn()}
                      disabled={posting || (settlementType === "STORE_CREDIT" && !invoice.customerContactId)}
                    >
                      {posting ? "Posting return..." : "Confirm and post credit note"}
                    </Button>
                    <Button variant="secondary" onClick={() => setReviewing(false)} disabled={posting}>Edit selection</Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      setError("");
                      if (selectedLines.length === 0) {
                        setError("Select at least one return quantity.");
                        return;
                      }
                      if (!reason.trim()) {
                        setError("Enter a return reason.");
                        return;
                      }
                      setReviewing(true);
                    }}
                    disabled={selectedLines.length === 0 || !reason.trim()}
                  >
                    Review return
                    <ArrowRight aria-hidden="true" size={16} />
                  </Button>
                )}
              </Card>
            </div>
          </>
        ) : (
          <Card className="space-y-3">
            <p className="text-sm">No posted invoice was found.</p>
            <Button variant="secondary" onClick={backToSearch}>Return to invoice search</Button>
          </Card>
        )}

        {error && invoice && <p className="text-sm text-[var(--erp-danger)]" role="alert">{error}</p>}
      </Section>
    </Page>
  );
}
