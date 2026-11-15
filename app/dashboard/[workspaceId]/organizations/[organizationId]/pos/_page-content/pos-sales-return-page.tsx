"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  customerPhone: string;
  entityName: string;
  totalAmount: string;
  lines: Array<{ id: string }>;
};

type ReturnRecord = {
  id: string;
  returnNumber: string;
  returnDate: string;
  invoiceNumber: string;
  customer: string;
  customerPhone: string;
  reason: string;
  status: string;
  settlementType: string | null;
  refundStatus: string | null;
  lineCount: number;
  totalCreditAmount: string;
};

type PageResult<T> = { records: T[]; nextCursor: string | null };
type Tab = "invoices" | "returns";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function formatMoney(value: string) {
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

export default function PosSalesReturnPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("invoices");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [returnSearch, setReturnSearch] = useState("");
  const [invoiceRecords, setInvoiceRecords] = useState<InvoiceRecord[]>([]);
  const [returnRecords, setReturnRecords] = useState<ReturnRecord[]>([]);
  const [invoiceCursor, setInvoiceCursor] = useState<string | null>(null);
  const [returnCursor, setReturnCursor] = useState<string | null>(null);
  const [invoiceHasMore, setInvoiceHasMore] = useState(false);
  const [returnHasMore, setReturnHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [invoiceVisibleFields, setInvoiceVisibleFields] = useState<string[]>([
    "invoiceNumber", "invoiceDate", "customer", "customerPhone", "lineCount", "totalAmount",
  ]);
  const [returnVisibleFields, setReturnVisibleFields] = useState<string[]>([
    "returnNumber", "returnDate", "invoiceNumber", "customer", "lineCount", "status", "settlementType", "refundStatus", "totalCreditAmount",
  ]);
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/sales-return`;
  const apiBase = `/api/organizations/${organizationId}/pos/sales-returns`;

  const invoiceFields = useMemo(() => [
    { key: "invoiceNumber", label: "Invoice No." },
    { key: "invoiceDate", label: "Invoice date" },
    { key: "customer", label: "Customer" },
    { key: "customerPhone", label: "Mobile" },
    { key: "entityName", label: "Shop / entity" },
    { key: "lineCount", label: "Items" },
    { key: "totalAmount", label: "Invoice total" },
  ], []);
  const returnFields = useMemo(() => [
    { key: "returnNumber", label: "Return No." },
    { key: "returnDate", label: "Return date" },
    { key: "invoiceNumber", label: "Invoice No." },
    { key: "customer", label: "Customer" },
    { key: "customerPhone", label: "Mobile" },
    { key: "lineCount", label: "Items" },
    { key: "status", label: "Status" },
    { key: "settlementType", label: "Settlement" },
    { key: "refundStatus", label: "Refund status" },
    { key: "totalCreditAmount", label: "Credit note total" },
  ], []);

  const fetchPage = useCallback(async (
    target: Tab,
    search: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<PageResult<InvoiceRecord | ReturnRecord>> => {
    const params = new URLSearchParams({ limit: "25" });
    if (search) params.set("search", search);
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${apiBase}${target === "invoices" ? "/invoices" : ""}?${params}`, {
      signal,
      cache: "no-store",
    });
    if (target === "invoices") {
      const result = await readJson<{ invoices: InvoiceRecord[]; nextCursor: string | null }>(response);
      return { records: result.invoices, nextCursor: result.nextCursor };
    }
    const result = await readJson<{ returns: ReturnRecord[]; nextCursor: string | null }>(response);
    return { records: result.returns, nextCursor: result.nextCursor };
  }, [apiBase]);

  useEffect(() => {
    const controller = new AbortController();
    const search = tab === "invoices" ? invoiceSearch : returnSearch;
    const isShortInvoiceSearch = tab === "invoices" && search.length < 2;
    const timeout = window.setTimeout(() => {
      if (isShortInvoiceSearch) {
        setInvoiceRecords([]);
        setInvoiceCursor(null);
        setInvoiceHasMore(false);
        setError("");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      void fetchPage(tab, search, null, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (tab === "invoices") {
            setInvoiceRecords(result.records as InvoiceRecord[]);
            setInvoiceCursor(result.nextCursor);
            setInvoiceHasMore(Boolean(result.nextCursor));
          } else {
            setReturnRecords(result.records as ReturnRecord[]);
            setReturnCursor(result.nextCursor);
            setReturnHasMore(Boolean(result.nextCursor));
          }
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setError(cause instanceof Error ? cause.message : "Unable to load records.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, isShortInvoiceSearch ? 0 : 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [fetchPage, invoiceSearch, retry, returnSearch, tab]);

  const loadMore = async () => {
    const isInvoiceTab = tab === "invoices";
    const cursor = isInvoiceTab ? invoiceCursor : returnCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await fetchPage(tab, isInvoiceTab ? invoiceSearch : returnSearch, cursor);
      if (isInvoiceTab) {
        setInvoiceRecords((current) => [...current, ...result.records as InvoiceRecord[]]);
        setInvoiceCursor(result.nextCursor);
        setInvoiceHasMore(Boolean(result.nextCursor));
      } else {
        setReturnRecords((current) => [...current, ...result.records as ReturnRecord[]]);
        setReturnCursor(result.nextCursor);
        setReturnHasMore(Boolean(result.nextCursor));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load more records.");
    } finally {
      setLoadingMore(false);
    }
  };

  const renderInvoiceCell = (key: string, record: InvoiceRecord) => {
    switch (key) {
      case "invoiceDate": return formatDate(record.invoiceDate);
      case "lineCount": return record.lines.length;
      case "totalAmount": return formatMoney(record.totalAmount);
      default: return String(record[key as keyof InvoiceRecord] ?? "—");
    }
  };
  const renderReturnCell = (key: string, record: ReturnRecord) => {
    switch (key) {
      case "returnDate": return formatDate(record.returnDate);
      case "totalCreditAmount": return formatMoney(record.totalCreditAmount);
      case "status": return <Badge>{record.status}</Badge>;
      case "settlementType": return record.settlementType?.replaceAll("_", " ") ?? "Legacy";
      case "refundStatus": return record.refundStatus ? <Badge>{record.refundStatus}</Badge> : "—";
      default: return String(record[key as keyof ReturnRecord] ?? "—");
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Point of Sale</p>
            <h1 className="erp-page-heading mt-1">Sales Return</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--erp-muted)]">
              Search posted invoices by invoice number, customer, or mobile. Returns post a credit note and restore the original stock.
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/pos`)}>
            Back to POS
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Sales return records">
          <Button aria-pressed={tab === "invoices"} variant={tab === "invoices" ? "primary" : "secondary"} onClick={() => setTab("invoices")}>
            Find invoice
          </Button>
          <Button aria-pressed={tab === "returns"} variant={tab === "returns" ? "primary" : "secondary"} onClick={() => setTab("returns")}>
            Return history
          </Button>
        </div>

        {tab === "invoices" ? (
          <Card className="space-y-4">
            <div>
              <h2 className="erp-card-title">Find a posted invoice</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">Enter at least 2 characters of an invoice number, customer name, or mobile number.</p>
            </div>
            <ReportGrid
              title="Posted POS invoices"
              records={invoiceRecords}
              fields={invoiceFields}
              visibleFields={invoiceVisibleFields}
              onVisibleFieldsChange={setInvoiceVisibleFields}
              storageKey={`pos-sales-return-invoices:${organizationId}`}
              rowIdSelector={(record) => record.id}
              selectedIds={[]}
              selectable={false}
              onRecordClick={(record) => router.push(`${base}/invoices/${encodeURIComponent(record.invoiceNumber)}`)}
              onSearchQueryChange={setInvoiceSearch}
              serverSideSearch
              searchMinLength={2}
              isLoading={loading}
              emptyMessage={invoiceSearch.length < 2 ? "Enter at least 2 characters to search posted invoices." : "No matching posted invoices found."}
              renderCell={renderInvoiceCell}
            />
          </Card>
        ) : (
          <Card className="space-y-4">
            <div>
              <h2 className="erp-card-title">Posted sales returns</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">Review credit notes by return number, invoice, customer, or mobile.</p>
            </div>
            <ReportGrid
              title="Sales return history"
              records={returnRecords}
              fields={returnFields}
              visibleFields={returnVisibleFields}
              onVisibleFieldsChange={setReturnVisibleFields}
              storageKey={`pos-sales-return-history:${organizationId}`}
              rowIdSelector={(record) => record.id}
              selectedIds={[]}
              selectable={false}
              onRecordClick={(record) => router.push(`${base}/records/${encodeURIComponent(record.returnNumber)}`)}
              onSearchQueryChange={setReturnSearch}
              serverSideSearch
              isLoading={loading}
              emptyMessage="No sales returns found."
              renderCell={renderReturnCell}
            />
          </Card>
        )}

        {error && (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-[var(--erp-danger)]" role="alert">
            <p className="text-sm text-[var(--erp-danger)]">{error}</p>
            <Button variant="secondary" onClick={() => setRetry((current) => current + 1)}>
              <RotateCcw aria-hidden="true" size={16} />
              Retry
            </Button>
          </Card>
        )}
        {((tab === "invoices" && invoiceHasMore) || (tab === "returns" && returnHasMore)) && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more"}
              <ArrowRight aria-hidden="true" size={16} />
            </Button>
          </div>
        )}
      </Section>
    </Page>
  );
}
