"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";

type FgIssuedRecord = {
  id: string;
  issueId: string;
  issueNo: string;
  issuedAt: string;
  sourceType: "PACKING_LIST" | "POS_INVOICE" | "MANUAL_ADJUSTMENT";
  movement: "ISSUE" | "REVERSAL";
  sourceDocumentId: string | null;
  sourceReference: string | null;
  issuedBy: string | null;
  stockType: "SKU" | "GENERAL" | "ALLOCATED";
  itemCode: string | null;
  styleName: string;
  articleNo: string | null;
  size: string | null;
  colour: string | null;
  quantity: string;
  uomCode: string;
  stockBefore: string;
  stockAfter: string;
};

type ReportResponse = {
  records: FgIssuedRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type Filters = {
  dateFrom: string;
  dateTo: string;
  sourceType: string;
  movement: string;
};

type ReportField = keyof FgIssuedRecord;

const reportFields: Array<{ key: ReportField; label: string }> = [
  { key: "issueNo", label: "Issue No" },
  { key: "issuedAt", label: "Date / Time" },
  { key: "sourceType", label: "Source Type" },
  { key: "sourceReference", label: "Source Document" },
  { key: "itemCode", label: "Item Code / SKU" },
  { key: "styleName", label: "Style Name" },
  { key: "articleNo", label: "Article No" },
  { key: "size", label: "Size" },
  { key: "colour", label: "Colour" },
  { key: "quantity", label: "Quantity" },
  { key: "uomCode", label: "UOM" },
  { key: "movement", label: "Movement" },
  { key: "stockType", label: "Stock Type" },
  { key: "issuedBy", label: "Issued By" },
  { key: "stockBefore", label: "Stock Before" },
  { key: "stockAfter", label: "Stock After" },
];

const initialFilters: Filters = { dateFrom: "", dateTo: "", sourceType: "", movement: "" };

function formatCell(field: string, record: FgIssuedRecord, workspaceId: string, organizationId: string) {
  if (field === "sourceReference") {
    if (!record.sourceReference) return "-";
    const href = record.sourceType === "POS_INVOICE" && record.sourceReference
      ? `/dashboard/${workspaceId}/organizations/${organizationId}/pos/invoice/${encodeURIComponent(record.sourceReference)}`
      : record.sourceType === "PACKING_LIST"
        ? `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/outward/fg-stock-dc`
        : null;
    return href
      ? <Link className="font-semibold text-[var(--erp-brand)] underline-offset-2 hover:underline" href={href}>{record.sourceReference}</Link>
      : record.sourceReference;
  }
  if (field === "issuedAt") {
    return new Date(record.issuedAt).toLocaleString("en-IN");
  }
  if (field === "quantity" || field === "stockBefore" || field === "stockAfter") {
    return Number(record[field]).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  return String(record[field as keyof FgIssuedRecord] ?? "-");
}

export default function FgIssuedReportPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params.workspaceId ?? "";
  const organizationId = params.organizationId ?? "";
  const [records, setRecords] = useState<FgIssuedRecord[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [visibleFields, setVisibleFields] = useState<ReportField[]>(reportFields.map(({ key }) => key));
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const requestKey = `${organizationId}:${JSON.stringify(appliedFilters)}`;
  const loading = Boolean(organizationId) && loadedKey !== requestKey;
  const visibleRecords = loading ? [] : records;

  const loadPage = useCallback(async (requestedPage: number, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      organizationId,
      page: String(requestedPage),
      pageSize: "50",
    });
    if (appliedFilters.dateFrom) query.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) query.set("dateTo", appliedFilters.dateTo);
    if (appliedFilters.sourceType) query.set("sourceType", appliedFilters.sourceType);
    if (appliedFilters.movement) query.set("movement", appliedFilters.movement);

    const response = await fetch(`/api/inventory/fg-issued?${query.toString()}`, {
      cache: "no-store",
      signal,
    });
    const responseText = await response.text();
    let payload: ReportResponse & { error?: string };
    try {
      payload = JSON.parse(responseText) as ReportResponse & { error?: string };
    } catch {
      throw new Error(response.ok
        ? "The FG Issued report returned an invalid response."
        : `The FG Issued report could not be loaded (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(payload.error || "Unable to load FG Issued records.");
    return payload;
  }, [appliedFilters, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    void loadPage(1, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecords(result.records);
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setError("");
        setLoadedKey(requestKey);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setRecords([]);
        setTotal(0);
        setHasMore(false);
        setError(loadError instanceof Error ? loadError.message : "Unable to load FG Issued records.");
        setLoadedKey(requestKey);
      });
    return () => controller.abort();
  }, [loadPage, organizationId, requestKey]);

  const loadMore = async () => {
    if (loadingMore || records.length >= total) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await loadPage(page + 1);
      setRecords((current) => [...current, ...result.records]);
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more FG Issued records.");
    } finally {
      setLoadingMore(false);
    }
  };

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <Page as="div">
      <Section>
        <div>
          <h1 className="text-2xl font-bold text-[var(--erp-text)]">FG Issued</h1>
          <p className="mt-1 text-sm text-slate-600">
            Finished-goods stock issues and reversals from packing lists and POS invoices.
          </p>
        </div>

        <Card>
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
                setError("Start date must not be later than end date.");
                return;
              }
              setError("");
              setAppliedFilters(filters);
            }}
          >
            <Input label="Date From" type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
            <Input label="Date To" type="date" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} />
            <Select
              label="Source Type"
              value={filters.sourceType}
              onChange={(event) => updateFilter("sourceType", event.target.value)}
              options={[
                { value: "", label: "All sources" },
                { value: "PACKING_LIST", label: "Packing List" },
                { value: "POS_INVOICE", label: "POS Invoice" },
                { value: "MANUAL_ADJUSTMENT", label: "Manual Adjustment" },
              ]}
            />
            <Select
              label="Movement"
              value={filters.movement}
              onChange={(event) => updateFilter("movement", event.target.value)}
              options={[
                { value: "", label: "All movements" },
                { value: "ISSUE", label: "Issue" },
                { value: "REVERSAL", label: "Reversal" },
              ]}
            />
            <div className="flex items-end gap-2">
              <Button type="submit">Apply filters</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setFilters(initialFilters);
                  setAppliedFilters(initialFilters);
                  setError("");
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        </Card>

        {error && <Card role="alert" className="text-sm text-[var(--erp-danger)]">{error}</Card>}
        {loading && <Card role="status" className="text-sm text-slate-600">Loading FG Issued records...</Card>}
        {!loading && !error && visibleRecords.length === 0 && (
          <Card className="text-center text-sm text-slate-600">
            No FG stock issue or reversal records match the selected filters.
          </Card>
        )}
        {visibleRecords.length > 0 && (
          <Card className="p-3">
            <ReportGrid
              title="FG Stock Issue Register"
              records={visibleRecords}
              fields={reportFields}
              visibleFields={visibleFields}
              onVisibleFieldsChange={(fields) => setVisibleFields(fields as ReportField[])}
              storageKey={`credence-craft-fg-issued-${organizationId}`}
              rowIdSelector={(record) => record.id}
              selectedIds={[]}
              selectable={false}
              renderCell={(field, record) => formatCell(field, record, workspaceId, organizationId)}
              emptyMessage="No FG stock issues match the current search."
            />
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </Card>
        )}
      </Section>
    </Page>
  );
}
