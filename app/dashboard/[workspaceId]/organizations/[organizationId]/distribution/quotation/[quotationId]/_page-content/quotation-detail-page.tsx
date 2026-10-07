"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Table from "@/components/ui/Table";
import type { DistributionQuotation, DistributionQuotationSummary } from "../../_page-content/quotation-types";

function amountForLine(unitPrice: string, quantity: number) {
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(unitPrice)) return null;
  const [whole, fraction = ""] = unitPrice.split(".");
  const priceInTenThousandths = BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
  const lineCents = (priceInTenThousandths * BigInt(quantity) + BigInt(50)) / BigInt(100);
  return lineCents;
}

function formatCents(cents: bigint) {
  const whole = cents / BigInt(100);
  const fraction = String(cents % BigInt(100)).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export default function QuotationDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; quotationId?: string; masterQuotationId?: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const quotationId = params.quotationId ?? params.masterQuotationId ?? "";
  const [quotation, setQuotation] = useState<DistributionQuotation | null>(null);
  const [children, setChildren] = useState<DistributionQuotationSummary[]>([]);
  const [quotationDate, setQuotationDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadQuotation = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/distribution/quotations/${encodeURIComponent(quotationId)}?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.quotation) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load quotation.");
      }
      const loaded = data.quotation as DistributionQuotation;
      setQuotation(loaded);
      setChildren(Array.isArray(data.children) ? data.children as DistributionQuotationSummary[] : []);
      setQuotationDate(loaded.quotationDate);
      setValidUntil(loaded.validUntil);
      setNotes(loaded.notes);
      setUnitPrices(Object.fromEntries(loaded.lines.map((line) => [line.id, line.unitPrice])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load quotation.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, quotationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQuotation(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQuotation]);

  const displayedTotal = useMemo(() => {
    if (!quotation) return "0.00";
    let totalCents = BigInt(0);
    for (const line of quotation.lines) {
      const amount = amountForLine(unitPrices[line.id] ?? line.unitPrice, line.quantity);
      if (amount === null) return "—";
      totalCents += amount;
    }
    return formatCents(totalCents);
  }, [quotation, unitPrices]);

  async function saveDraft() {
    if (!quotation) return;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/distribution/quotations/${encodeURIComponent(quotation.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          quotationDate,
          validUntil,
          notes,
          lines: quotation.lines.map((line) => ({ id: line.id, unitPrice: unitPrices[line.id] ?? "0" })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.quotation) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to save quotation.");
      }
      setQuotation(data.quotation as DistributionQuotation);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save quotation.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="erp-eyebrow">Distribution / Quotation</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            {quotation?.quotationNo ?? "Quotation Draft"}
          </h1>
          {quotation ? <p className="mt-2 text-sm text-slate-600">{quotation.customer} · {quotation.orderNo}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/quotation`)}>
            Quotation List
          </Button>
          {quotation?.mode !== "MASTER" && quotation?.status === "DRAFT" ? (
            <Button type="button" variant="primary" onClick={() => void saveDraft()} disabled={isSaving || isLoading}>
              {isSaving ? "Saving..." : "Save Draft"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {isLoading ? <p role="status" className="text-sm text-slate-600">Loading quotation...</p> : null}
      {!isLoading && quotation ? (
        <>
          <Card className="space-y-4 p-6 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Quotation Header</h2>
                <p className="mt-1 text-sm text-slate-600">Database-backed draft · Vendor and source orders are inherited from the selected bookings.</p>
              </div>
              <Badge>{quotation.status}</Badge>
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Input label="Quotation No" value={quotation.quotationNo} readOnly />
              <Input label="Vendor" value={quotation.customer} readOnly />
              <Input label="Source Order(s)" value={quotation.orderNo} readOnly />
              <Input label="Quotation Date" type="date" value={quotationDate} onChange={(event) => setQuotationDate(event.target.value)} disabled={quotation.mode === "MASTER" || quotation.status !== "DRAFT"} />
              <Input label="Valid Until" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} disabled={quotation.mode === "MASTER" || quotation.status !== "DRAFT"} />
              <Input label="Total Quantity" value={String(quotation.totalQuantity)} readOnly />
              <Input label="Subtotal" value={displayedTotal} readOnly />
            </div>
            <Input
              label="Notes and Terms"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              disabled={quotation.mode === "MASTER" || quotation.status !== "DRAFT"}
            />
          </Card>

          {quotation.mode === "MASTER" ? (
            <Card className="space-y-3 p-6 shadow-none">
              <h2 className="text-base font-semibold text-slate-900">Included Quotations</h2>
              <ul className="space-y-2">
                {children.map((child) => (
                  <li key={child.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--erp-border)] pb-2 text-sm">
                    <span>{child.quotationNo} · {child.customer}</span>
                    <span>{child.totalQuantity} units · {child.subtotal}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="space-y-3 p-4 shadow-none">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Quotation Subform</h2>
                <p className="mt-1 text-sm text-slate-600">Booking quantities and size lines are fixed to their source bookings. Enter the unit price for each line.</p>
              </div>
              <Table tableClassName="min-w-[60rem]">
                <thead className="bg-[var(--erp-surface-soft)] text-left text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Booking</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Unit Price</th><th className="px-3 py-2">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)] text-sm text-slate-700">
                  {quotation.lines.map((line) => {
                    const amount = amountForLine(unitPrices[line.id] ?? line.unitPrice, line.quantity);
                    return (
                      <tr key={line.id}>
                        <td className="px-3 py-2">{line.bookingNo}</td>
                        <td className="px-3 py-2">{line.orderNo}</td>
                        <td className="px-3 py-2">{line.description || "—"}</td>
                        <td className="px-3 py-2">{line.size}</td>
                        <td className="px-3 py-2">{line.quantity}</td>
                        <td className="w-40 px-3 py-2">
                          <Input
                            aria-label={`Unit price for ${line.bookingNo} size ${line.size}`}
                            type="number"
                            min="0"
                            step="0.0001"
                            value={unitPrices[line.id] ?? "0"}
                            onChange={(event) => setUnitPrices((current) => ({ ...current, [line.id]: event.target.value }))}
                            disabled={quotation.status !== "DRAFT"}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{amount === null ? "—" : formatCents(amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
