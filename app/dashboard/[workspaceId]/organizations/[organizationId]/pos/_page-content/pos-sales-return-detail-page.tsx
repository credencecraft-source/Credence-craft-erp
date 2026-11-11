"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

type SalesReturnRecord = {
  id: string;
  returnNumber: string;
  returnDate: string;
  reason: string;
  status: string;
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  customerPhone: string;
  entityName: string;
  subtotal: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  taxAmount: string;
  totalCreditAmount: string;
  settlementType: string | null;
  refundMethod: string | null;
  refundStatus: string | null;
  refundReference: string | null;
  refundedAt: string | null;
  storeCreditBalanceAmount: string | null;
  postedAt: string;
  lines: Array<{
    styleName: string;
    orderNo: string;
    articleNo: string;
    size: string;
    colour: string;
    quantity: number;
    unitRate: string;
    gstRate: string;
    taxableAmount: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    totalAmount: string;
  }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(value: string | number) {
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

export default function PosSalesReturnDetailPage({
  workspaceId,
  organizationId,
  returnNumber,
}: {
  workspaceId: string;
  organizationId: string;
  returnNumber: string;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<SalesReturnRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const [savingRefund, setSavingRefund] = useState(false);
  const apiPath = `/api/organizations/${organizationId}/pos/sales-returns/${encodeURIComponent(returnNumber)}`;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/sales-return`;

  const settleRefund = async () => {
    if (!record || record.settlementType !== "REFUND" || record.refundStatus !== "PENDING" || savingRefund) return;
    if (!confirmingRefund) {
      setConfirmingRefund(true);
      return;
    }
    setSavingRefund(true);
    setError("");
    try {
      await readJson(await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: refundReference.trim() || null }),
      }));
      setRecord({
        ...record,
        refundStatus: "REFUNDED",
        refundReference: refundReference.trim() || null,
        refundedAt: new Date().toISOString(),
      });
      setConfirmingRefund(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the refund.");
    } finally {
      setSavingRefund(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath, { signal: controller.signal, cache: "no-store" })
      .then((response) => readJson<{ salesReturn: SalesReturnRecord }>(response))
      .then((result) => {
        if (!controller.signal.aborted) setRecord(result.salesReturn);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load sales return.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiPath]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Point of Sale / Sales Return</p>
            <h1 className="erp-page-heading mt-1">Credit note</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">Read-only posted sales return and stock reversal record.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {record && (
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer aria-hidden="true" size={16} />
                Print
              </Button>
            )}
            <Button variant="secondary" onClick={() => router.push(base)}>
              <ArrowLeft aria-hidden="true" size={16} />
              Return history
            </Button>
          </div>
        </div>

        {loading ? (
          <Card aria-busy="true"><p className="text-sm text-[var(--erp-muted)]">Loading sales return…</p></Card>
        ) : error ? (
          <Card role="alert" className="space-y-3">
            <p className="text-sm text-[var(--erp-danger)]">{error}</p>
            <Button variant="secondary" onClick={() => router.push(base)}>Return to sales returns</Button>
          </Card>
        ) : record ? (
          <div className="space-y-6 print:space-y-4">
            {error && (
              <Card role="alert" className="border-[var(--erp-danger)]">
                <p className="text-sm text-[var(--erp-danger)]">{error}</p>
              </Card>
            )}
            <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:shadow-none">
              <div><p className="erp-eyebrow">Credit note</p><p className="mt-1 font-semibold">{record.returnNumber}</p></div>
              <div><p className="erp-eyebrow">Status</p><div className="mt-1"><Badge>{record.status}</Badge></div></div>
              <div><p className="erp-eyebrow">Return date</p><p className="mt-1 font-semibold">{formatDate(record.returnDate)}</p></div>
              <div><p className="erp-eyebrow">Posted at</p><p className="mt-1 font-semibold">{formatDate(record.postedAt)}</p></div>
            </Card>

            <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:shadow-none">
              <div>
                <p className="erp-eyebrow">Settlement</p>
                <p className="mt-1 font-semibold">
                  {record.settlementType === "STORE_CREDIT" ? "Store credit" : record.settlementType === "REFUND" ? "Customer refund" : "Not classified"}
                </p>
              </div>
              {record.settlementType === "STORE_CREDIT" ? (
                <div>
                  <p className="erp-eyebrow">Available store credit</p>
                  <p className="mt-1 font-semibold">{formatMoney(record.storeCreditBalanceAmount ?? 0)}</p>
                </div>
              ) : record.settlementType === "REFUND" ? (
                <>
                  <div>
                    <p className="erp-eyebrow">Refund method</p>
                    <p className="mt-1 font-semibold">{record.refundMethod?.replaceAll("_", " ") ?? "—"}</p>
                  </div>
                  <div>
                    <p className="erp-eyebrow">Refund status</p>
                    <div className="mt-1"><Badge>{record.refundStatus ?? "PENDING"}</Badge></div>
                    {record.refundReference && <p className="mt-1 text-xs text-[var(--erp-muted)]">Reference: {record.refundReference}</p>}
                  </div>
                  {record.refundStatus === "PENDING" && (
                    <div className="space-y-2 print:hidden">
                      <Input
                        id="refund-reference"
                        label="Refund reference (optional)"
                        value={refundReference}
                        onChange={(event) => setRefundReference(event.target.value)}
                        maxLength={100}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void settleRefund()} disabled={savingRefund}>
                          {savingRefund ? "Saving..." : confirmingRefund ? "Confirm refund paid" : "Mark refund paid"}
                        </Button>
                        {confirmingRefund && (
                          <Button variant="secondary" onClick={() => setConfirmingRefund(false)} disabled={savingRefund}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div><p className="text-sm text-[var(--erp-muted)]">This historical return has no settlement classification.</p></div>
              )}
            </Card>

            <Card className="grid gap-6 md:grid-cols-2 print:shadow-none">
              <div className="space-y-2">
                <h2 className="erp-card-title">Original sale</h2>
                <p className="text-sm"><span className="text-[var(--erp-muted)]">Invoice: </span><Link className="font-semibold text-[var(--erp-brand)] underline" href={`/dashboard/${workspaceId}/organizations/${organizationId}/pos/invoices/${encodeURIComponent(record.invoiceNumber)}`}>{record.invoiceNumber}</Link></p>
                <p className="text-sm"><span className="text-[var(--erp-muted)]">Invoice date: </span>{formatDate(record.invoiceDate)}</p>
                <p className="text-sm"><span className="text-[var(--erp-muted)]">Customer: </span>{record.customer || "Customer not linked"}</p>
                <p className="text-sm"><span className="text-[var(--erp-muted)]">Mobile: </span>{record.customerPhone || "—"}</p>
                <p className="text-sm"><span className="text-[var(--erp-muted)]">Shop / entity: </span>{record.entityName || "—"}</p>
              </div>
              <div className="space-y-2">
                <h2 className="erp-card-title">Return reason</h2>
                <p className="whitespace-pre-wrap text-sm">{record.reason}</p>
              </div>
            </Card>

            <Card className="space-y-4 print:shadow-none">
              <h2 className="erp-card-title">Returned items</h2>
              <Table>
                <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Item</th>
                    <th scope="col" className="px-4 py-3">Size / colour</th>
                    <th scope="col" className="px-4 py-3 text-right">Qty</th>
                    <th scope="col" className="px-4 py-3 text-right">Rate</th>
                    <th scope="col" className="px-4 py-3 text-right">Taxable</th>
                    <th scope="col" className="px-4 py-3 text-right">GST</th>
                    <th scope="col" className="px-4 py-3 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {record.lines.map((line, index) => (
                    <tr key={`${line.articleNo}-${line.size}-${index}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{line.styleName || line.articleNo || "Item"}</p>
                        <p className="text-xs text-[var(--erp-muted)]">{line.articleNo}{line.orderNo ? ` · ${line.orderNo}` : ""}</p>
                      </td>
                      <td className="px-4 py-3">{[line.size, line.colour].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.unitRate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.taxableAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(Number(line.cgstAmount) + Number(line.sgstAmount) + Number(line.igstAmount))}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(line.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="ml-auto w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span className="text-[var(--erp-muted)]">Subtotal</span><span>{formatMoney(record.subtotal)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-[var(--erp-muted)]">Tax</span><span>{formatMoney(record.taxAmount)}</span></div>
                <div className="flex justify-between gap-4 border-t border-[var(--erp-border)] pt-3 text-base font-semibold">
                  <span>Total credit note</span><span>{formatMoney(record.totalCreditAmount)}</span>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <Card><p className="text-sm">Sales return was not found.</p></Card>
        )}
      </Section>
    </Page>
  );
}
