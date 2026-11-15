"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type FinanceTransaction = {
  id: string;
  documentType: string;
  documentNumber: string;
  documentDate: string;
  status: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  sourceDocumentNumber: string;
  partyName: string;
  entityName: string | null;
  subtotal: string;
  totalTaxAmount: string;
  totalAmount: string;
  syncStatus: string;
  externalProvider: string;
  externalVoucherNumber: string | null;
  lineCount: number;
};

type ReportResponse = {
  transactions: FinanceTransaction[];
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  totals: {
    subtotal: string;
    totalTaxAmount: string;
    totalAmount: string;
  };
};

type FinanceReportField = keyof Pick<
  FinanceTransaction,
  | "documentType"
  | "documentNumber"
  | "documentDate"
  | "partyName"
  | "sourceModule"
  | "sourceDocumentNumber"
  | "subtotal"
  | "totalTaxAmount"
  | "totalAmount"
  | "status"
  | "syncStatus"
>;

const reportFields: Array<{ key: FinanceReportField; label: string }> = [
  { key: "documentType", label: "Type" },
  { key: "documentNumber", label: "Document No." },
  { key: "documentDate", label: "Date" },
  { key: "partyName", label: "Party" },
  { key: "sourceModule", label: "Source" },
  { key: "sourceDocumentNumber", label: "Source Document" },
  { key: "subtotal", label: "Taxable Amount" },
  { key: "totalTaxAmount", label: "Tax" },
  { key: "totalAmount", label: "Total" },
  { key: "status", label: "Status" },
  { key: "syncStatus", label: "Sync Status" },
];

const documentStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "LOCKED", "CANCELLED", "REVERSED"];

function isReportResponse(value: unknown): value is ReportResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ReportResponse>;
  return Array.isArray(record.transactions)
    && typeof record.count === "number"
    && typeof record.hasMore === "boolean"
    && (typeof record.nextCursor === "string" || record.nextCursor === null)
    && Boolean(record.totals);
}

function money(value: string) {
  return `Rs ${value}`;
}

export default function FinanceTransactionsReportPage({
  workspaceId,
  organizationId,
  title,
  documentType,
  storageKey,
  showAll = false,
  headerActions,
}: {
  workspaceId: string;
  organizationId: string;
  title: string;
  documentType?: string;
  storageKey: string;
  showAll?: boolean;
  headerActions?: ReactNode;
}) {
  const [records, setRecords] = useState<FinanceTransaction[]>([]);
  const [totals, setTotals] = useState<ReportResponse["totals"]>({
    subtotal: "0.00",
    totalTaxAmount: "0.00",
    totalAmount: "0.00",
  });
  const [visibleFields, setVisibleFields] = useState<FinanceReportField[]>(
    reportFields.map((field) => field.key),
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const params = useMemo(() => {
    const query = new URLSearchParams({ limit: "50" });
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if (documentType) query.set("documentType", documentType);
    return query;
  }, [documentType, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetch(`/api/organizations/${organizationId}/finance/transactions?${params}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload: unknown = await response.json();
          if (!response.ok) {
            const message = payload && typeof payload === "object" && "error" in payload
              ? String(payload.error)
              : "Unable to load finance transactions.";
            throw new Error(message);
          }
          if (!isReportResponse(payload)) throw new Error("Finance transaction response was invalid.");
          setRecords(payload.transactions);
          setTotals(payload.totals);
          setHasMore(payload.hasMore);
          setCursor(payload.nextCursor);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setError(cause instanceof Error ? cause.message : "Unable to load finance transactions.");
          setRecords([]);
          setHasMore(false);
          setCursor(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, search ? 250 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [organizationId, params, reloadKey, search]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextParams = new URLSearchParams(params);
      nextParams.set("cursor", cursor);
      const response = await fetch(
        `/api/organizations/${organizationId}/finance/transactions?${nextParams}`,
      );
      const payload: unknown = await response.json();
      if (!response.ok || !isReportResponse(payload)) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "Unable to load more finance transactions.",
        );
      }
      setRecords((current) => [...current, ...payload.transactions]);
      setHasMore(payload.hasMore);
      setCursor(payload.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load more finance transactions.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, organizationId, params]);

  const renderCell = (fieldKey: string, record: FinanceTransaction) => {
    if (["subtotal", "totalTaxAmount", "totalAmount"].includes(fieldKey)) {
      return money(record[fieldKey as "subtotal" | "totalTaxAmount" | "totalAmount"]);
    }
    if (fieldKey === "status") return <Badge>{record.status}</Badge>;
    if (fieldKey === "syncStatus") return <Badge>{record.syncStatus.replaceAll("_", " ")}</Badge>;
    if (fieldKey === "documentNumber") {
      return (
        <Link
          className="font-medium text-[var(--erp-brand)] underline"
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions/${encodeURIComponent(record.id)}`}
        >
          {record.documentNumber}
        </Link>
      );
    }
    if (fieldKey === "sourceModule") {
      return (
        <div>
          <div className="font-medium">{record.sourceModule.replaceAll("_", " ")}</div>
          <div className="text-xs text-[var(--erp-text-muted)]">
            {record.sourceType.replaceAll("_", " ")}
          </div>
        </div>
      );
    }
    if (fieldKey === "sourceDocumentNumber") {
      const sourceHref = record.sourceType === "POS_SALES_INVOICE"
        ? `/dashboard/${workspaceId}/organizations/${organizationId}/pos/invoice/${encodeURIComponent(record.sourceDocumentNumber)}`
        : record.sourceType === "POS_PURCHASE_BILL"
          ? `/dashboard/${workspaceId}/organizations/${organizationId}/pos/purchase-bill/${encodeURIComponent(record.sourceId)}`
          : record.sourceType === "POS_SALES_RETURN"
            ? `/dashboard/${workspaceId}/organizations/${organizationId}/pos/sales-return/records/${encodeURIComponent(record.sourceDocumentNumber)}`
            : null;
      return (
        <div>
          {sourceHref
            ? <Link className="font-medium text-[var(--erp-brand)] underline" href={sourceHref}>{record.sourceDocumentNumber}</Link>
            : <div>{record.sourceDocumentNumber}</div>}
        </div>
      );
    }
    return String(record[fieldKey as FinanceReportField] ?? "");
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance</p>
            <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm text-[var(--erp-text-muted)]">
              Tenant-scoped transaction records and totals from the central finance service.
            </p>
          </div>
          {headerActions}
        </header>

        {showAll && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <p className="text-sm text-[var(--erp-text-muted)]">Taxable amount</p>
              <p className="mt-2 text-xl font-semibold">{money(totals.subtotal)}</p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--erp-text-muted)]">Tax total</p>
              <p className="mt-2 text-xl font-semibold">{money(totals.totalTaxAmount)}</p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--erp-text-muted)]">Document total</p>
              <p className="mt-2 text-xl font-semibold">{money(totals.totalAmount)}</p>
            </Card>
          </div>
        )}

        {error && (
          <Card className="border-[var(--erp-danger)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--erp-danger)]">{error}</p>
              <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                Retry
              </Button>
            </div>
          </Card>
        )}

        <ReportGrid
          title={`${title} Report`}
          records={records}
          fields={reportFields}
          visibleFields={visibleFields}
          onVisibleFieldsChange={(fields) => setVisibleFields(fields as FinanceReportField[])}
          storageKey={storageKey}
          rowIdSelector={(record) => record.id}
          selectedIds={[]}
          statusOptions={documentStatuses}
          selectedStatus={status}
          onStatusChange={setStatus}
          onSearchQueryChange={setSearch}
          serverSideSearch
          serverSideFilters
          searchMinLength={1}
          renderCell={renderCell}
          isLoading={loading}
          emptyMessage="No finance transactions match this report."
        />
        {hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </Section>
    </Page>
  );
}
