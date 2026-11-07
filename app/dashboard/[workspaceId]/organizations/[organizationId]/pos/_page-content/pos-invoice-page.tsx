"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import PosInvoicePrintDocument, { type PosInvoicePrintData } from "./pos-invoice-print-document";
import PosCouponPrintDocument from "./pos-coupon-print-document";
import {
  getDefaultOrganizationPrintTemplateDesign,
  parseOrganizationPrintTemplateDesign,
  type OrganizationPrintTemplateDesign,
} from "@/lib/services/distribution/organization-print-template-contract";


type SavedInvoice = PosInvoicePrintData & {
  invoiceNumber: string;
  invoiceDate: string;
  savedAt: string;
  hasCouponCode?: boolean;
};

const reportFields: Array<{ key: keyof SavedInvoice; label: string }> = [
  { key: "invoiceNumber", label: "Invoice No." },
  { key: "invoiceDate", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "entityName", label: "Entity" },
  { key: "couponDiscountAmount", label: "Coupon Discount" },
  { key: "subtotal", label: "Total" },
];

export default function PosInvoicePage({ workspaceId, organizationId }: { workspaceId: string; organizationId: string }) {
  const router = useRouter();
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/invoice`;
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const [visibleReportFields, setVisibleReportFields] = useState<Array<string | keyof SavedInvoice>>(
    reportFields.map((field) => field.key),
  );

  useEffect(() => {
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    const timeoutId = window.setTimeout(async () => {
      setInvoices([]);
      setNextCursor(null);
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams();
        if (search) query.set("search", search);
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/pos/sales?${query}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json() as {
          invoices?: SavedInvoice[];
          nextCursor?: string | null;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Unable to load saved POS invoices.");
        setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
        setNextCursor(data.nextCursor ?? null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load saved POS invoices.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      requestController.current?.abort();
    };
  }, [organizationId, search]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ cursor: nextCursor });
      if (search) query.set("search", search);
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/sales?${query}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json() as {
        invoices?: SavedInvoice[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load more POS invoices.");
      setInvoices((current) => [...current, ...(Array.isArray(data.invoices) ? data.invoices : [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load more POS invoices.");
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  const renderCell = (fieldKey: string, record: SavedInvoice) => {
    switch (fieldKey) {
      case "customer":
        return record.customer || "Walk-in customer";
      case "entityName":
        return record.entityName || "-";
      case "quantity":
        return record.lines.reduce((total, line) => total + line.quantity, 0);
      case "subtotal":
        return <span className="font-semibold text-slate-900">Rs {record.subtotal.toFixed(2)}</span>;
      case "couponDiscountAmount":
        return <span className="font-semibold">Rs {(record.couponDiscountAmount ?? 0).toFixed(2)}</span>;
      default:
        return String(record[fieldKey as keyof SavedInvoice] ?? "");
    }
  };

  return <Page as="div"><Section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4"><div><p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">POS Invoice</p><h1 className="mt-2 text-3xl font-bold text-slate-900">Saved Invoices</h1><p className="mt-2 text-sm text-slate-600">Review and print sales invoices saved from Quick Invoice.</p></div></div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading POS invoices...</p> : <>
      <ReportGrid
        title="Saved POS Invoices"
        records={invoices}
        fields={reportFields}
        visibleFields={visibleReportFields}
        onVisibleFieldsChange={setVisibleReportFields}
        rowIdSelector={(record) => record.invoiceNumber}
        selectedIds={[]}
        onRowClick={(recordId) => router.push(`${basePath}/${encodeURIComponent(recordId)}`)}
        onSearchQueryChange={setSearch}
        serverSideSearch
        searchMinLength={2}
        renderCell={renderCell}
        rowActions={(record) => (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => router.push(
                `${basePath}/${encodeURIComponent(record.invoiceNumber)}?print=invoice`,
              )}
            >
              Print Invoice
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!record.hasCouponCode}
              title={record.hasCouponCode ? undefined : "No coupon code is linked to this invoice."}
              onClick={() => router.push(
                `${basePath}/${encodeURIComponent(record.invoiceNumber)}?print=coupon`,
              )}
            >
              Print Coupon Code
            </Button>
          </>
        )}
        emptyMessage="No saved POS invoices yet."
      />
      {nextCursor && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more invoices"}
          </Button>
        </div>
      )}
    </>}
  </Section></Page>;
}

export function PosInvoiceDetailPage({
  workspaceId,
  organizationId,
  invoiceNumber,
  initialPrintMode,
}: {
  workspaceId: string;
  organizationId: string;
  invoiceNumber: string;
  initialPrintMode?: "invoice" | "coupon";
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<SavedInvoice | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [localPrintMode, setLocalPrintMode] = useState<"invoice" | "coupon" | null>(null);
  const printMode = localPrintMode ?? initialPrintMode ?? null;
  const [printDesign, setPrintDesign] = useState<OrganizationPrintTemplateDesign>(
    getDefaultOrganizationPrintTemplateDesign("POS_INVOICE"),
  );
  const [printTemplateLoading, setPrintTemplateLoading] = useState(true);
  const [printTemplateError, setPrintTemplateError] = useState("");
  const [templateRetry, setTemplateRetry] = useState(0);
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/invoice`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/sales?invoiceNumber=${encodeURIComponent(invoiceNumber)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { invoices?: SavedInvoice[]; error?: string };
        if (!response.ok || !Array.isArray(data.invoices) || !data.invoices[0]) {
          throw new Error(data.error || "Unable to load POS invoice.");
        }
        setInvoice(data.invoices[0]);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load POS invoice.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [invoiceNumber, organizationId]);

  useEffect(() => {
    if (printMode !== "invoice") return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      workspaceId,
      organizationId,
      defaultFor: "POS_INVOICE",
    });
    fetch(`/api/organizations/print-templates?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { designConfig?: unknown; error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load the POS invoice print template.");
        setPrintDesign(data.designConfig === null || data.designConfig === undefined
          ? getDefaultOrganizationPrintTemplateDesign("POS_INVOICE")
          : parseOrganizationPrintTemplateDesign(data.designConfig));
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setPrintTemplateError(
            loadError instanceof Error ? loadError.message : "Unable to load the POS invoice print template.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPrintTemplateLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, printMode, templateRetry, workspaceId]);

  const formatAmount = (amount: number) =>
    `Rs ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const closePrintView = () => {
    setLocalPrintMode(null);
    if (printMode) {
      router.replace(`${reportPath}/${encodeURIComponent(invoiceNumber)}`, { scroll: false });
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        {loading ? <p role="status">Loading POS invoice...</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {invoice && !printMode ? (
          <>
            <header className="erp-page-header items-start">
              <div>
                <p className="erp-eyebrow">Posted POS invoice</p>
                <h1 className="erp-page-heading mt-0.5">{invoice.invoiceNumber}</h1>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Invoice details · {invoice.invoiceDate}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>
                  Back to invoices
                </Button>
                <Button
                  type="button"
                  onClick={() => setLocalPrintMode("invoice")}
                >
                  Print preview
                </Button>
              </div>
            </header>

            <Card className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Invoice information</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Posted invoices are read-only. Use Print preview to view and print the configured document.
                </p>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium text-[var(--erp-muted)]">Customer</dt>
                  <dd className="mt-1 font-semibold text-[var(--erp-text)]">{invoice.customer || "Walk-in customer"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--erp-muted)]">Entity / Store</dt>
                  <dd className="mt-1 font-semibold text-[var(--erp-text)]">{invoice.entityName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--erp-muted)]">Status</dt>
                  <dd className="mt-1 font-semibold text-[var(--erp-text)]">{invoice.status || "POSTED"}</dd>
                </div>
                {invoice.appliedCouponCode ? (
                  <div>
                    <dt className="text-xs font-medium text-[var(--erp-muted)]">Applied coupon</dt>
                    <dd className="mt-1 font-semibold text-[var(--erp-text)]">
                      {invoice.appliedCouponCode} · {formatAmount(invoice.couponDiscountAmount ?? 0)}
                    </dd>
                  </div>
                ) : null}
                {invoice.issuedCouponCode ? (
                  <div>
                    <dt className="text-xs font-medium text-[var(--erp-muted)]">Reward coupon issued</dt>
                    <dd className="mt-1 font-semibold text-[var(--erp-text)]">
                      {invoice.issuedCouponCode}
                      {invoice.issuedCouponExpiresAt ? ` · Expires ${invoice.issuedCouponExpiresAt}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>

            <Card className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Invoice items</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">{invoice.lines.length} item lines</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-[var(--erp-border)] text-xs font-semibold text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-3 py-3">Item</th>
                      <th className="px-3 py-3">Order / Article</th>
                      <th className="px-3 py-3">Size</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Rate</th>
                      <th className="px-3 py-3 text-right">Taxable</th>
                      <th className="px-3 py-3 text-right">Tax</th>
                      <th className="px-3 py-3 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--erp-border)]">
                    {invoice.lines.map((line, index) => (
                      <tr key={`${line.record.id}-${index}`}>
                        <td className="px-3 py-3">
                          <span className="font-medium text-[var(--erp-text)]">{line.record.style_name}</span>
                          {line.record.colour ? <span className="block text-xs text-[var(--erp-muted)]">{line.record.colour}</span> : null}
                          {line.appliedOffer ? (
                            <span className="block text-xs text-[var(--erp-muted)]">
                              Offer: {line.appliedOffer.code} — {line.appliedOffer.name}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">{[line.record.order_no, line.record.article_no].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="px-3 py-3">{line.record.size || "—"}</td>
                        <td className="px-3 py-3 text-right">{line.quantity}</td>
                        <td className="px-3 py-3 text-right">{formatAmount(line.rate)}</td>
                        <td className="px-3 py-3 text-right">{formatAmount(line.amount)}</td>
                        <td className="px-3 py-3 text-right">{formatAmount(line.taxAmount ?? 0)}</td>
                        <td className="px-3 py-3 text-right font-semibold">{formatAmount(line.totalAmount ?? line.amount + (line.taxAmount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto grid w-full max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-[var(--erp-muted)]">Taxable subtotal (after discounts)</dt>
                <dd className="text-right font-medium">{formatAmount(invoice.subtotal)}</dd>
                {invoice.couponDiscountAmount ? (
                  <>
                    <dt className="text-[var(--erp-muted)]">Coupon discount</dt>
                    <dd className="text-right font-medium">{formatAmount(invoice.couponDiscountAmount)}</dd>
                  </>
                ) : null}
                <dt className="text-[var(--erp-muted)]">CGST</dt>
                <dd className="text-right font-medium">{formatAmount(invoice.cgstAmount ?? 0)}</dd>
                <dt className="text-[var(--erp-muted)]">SGST</dt>
                <dd className="text-right font-medium">{formatAmount(invoice.sgstAmount ?? 0)}</dd>
                <dt className="text-[var(--erp-muted)]">IGST</dt>
                <dd className="text-right font-medium">{formatAmount(invoice.igstAmount ?? 0)}</dd>
                <dt className="border-t border-[var(--erp-border)] pt-2 font-semibold text-[var(--erp-text)]">Invoice total</dt>
                <dd className="border-t border-[var(--erp-border)] pt-2 text-right font-semibold text-[var(--erp-text)]">
                  {formatAmount(invoice.grandTotal ?? invoice.subtotal + (invoice.taxAmount ?? 0))}
                </dd>
              </dl>
            </Card>
          </>
        ) : null}
        {printTemplateLoading && invoice && printMode === "invoice" ? <p role="status">Loading the saved invoice print template...</p> : null}
        {printTemplateError && printMode === "invoice" ? (
          <div className="flex flex-wrap items-center gap-3" role="alert">
            <p>{printTemplateError}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPrintTemplateLoading(true);
                setPrintTemplateError("");
                setTemplateRetry((value) => value + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {invoice && printMode === "invoice" ? (
          <PosInvoicePrintDocument
            invoice={invoice}
            design={printDesign}
            onBack={closePrintView}
            printDisabled={printTemplateLoading || Boolean(printTemplateError)}
          />
        ) : null}
        {invoice && printMode === "coupon" ? (
          invoice.issuedCouponCode || invoice.appliedCouponCode ? (
            <PosCouponPrintDocument
              invoice={invoice}
              onBack={closePrintView}
            />
          ) : (
            <div className="space-y-3" role="alert">
              <p>No coupon code is linked to this invoice.</p>
              <Button type="button" variant="secondary" onClick={closePrintView}>
                Back to invoice
              </Button>
            </div>
          )
        ) : null}
      </Section>
    </Page>
  );
}