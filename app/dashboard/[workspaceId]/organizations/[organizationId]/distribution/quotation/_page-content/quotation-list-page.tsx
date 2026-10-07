"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { validateMasterQuotationChildSelection } from "@/lib/services/distribution/quotation-selection-service";
import type { DistributionQuotationSummary } from "./quotation-types";

type QuotationField = keyof Pick<
  DistributionQuotationSummary,
  "quotationNo" | "orderNo" | "customer" | "mode" | "status" | "totalQuantity" | "subtotal" | "createdAt"
>;

const fields: Array<{ key: QuotationField; label: string }> = [
  { key: "quotationNo", label: "Quotation No" },
  { key: "orderNo", label: "Order No" },
  { key: "customer", label: "Vendor" },
  { key: "mode", label: "Type" },
  { key: "status", label: "Status" },
  { key: "totalQuantity", label: "Total Qty" },
  { key: "subtotal", label: "Subtotal" },
  { key: "createdAt", label: "Created Date" },
];

export default function QuotationListPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const [quotations, setQuotations] = useState<DistributionQuotationSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<QuotationField[]>(fields.map(({ key }) => key));
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingMaster, setIsCreatingMaster] = useState(false);

  const loadQuotations = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/distribution/quotations?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.quotations)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load quotations.");
      }
      setQuotations(data.quotations as DistributionQuotationSummary[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load quotations.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQuotations(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQuotations]);

  const regularQuotations = useMemo(
    () => quotations.filter((quotation) => quotation.mode !== "MASTER" && !quotation.parentQuotationId),
    [quotations],
  );
  const validationQuotes = useMemo(
    () => regularQuotations.map((quotation) => ({
      quoteId: quotation.id,
      parentQuoteId: quotation.parentQuotationId ?? undefined,
    })),
    [regularQuotations],
  );
  const selectionError = validateMasterQuotationChildSelection(selectedIds, validationQuotes);

  async function createMasterQuotation() {
    setIsCreatingMaster(true);
    setError("");
    try {
      const response = await fetch("/api/distribution/master-quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, quotationIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.quotation?.id !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to create master quotation.");
      }
      router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/master-quotation/${encodeURIComponent(data.quotation.id)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create master quotation.");
    } finally {
      setIsCreatingMaster(false);
    }
  }

  function openQuotation(id: string) {
    router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/quotation/${encodeURIComponent(id)}`);
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="erp-eyebrow">Distribution / Quotation</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Quotations</h1>
          <p className="mt-2 text-sm text-slate-600">Database-backed quotation headers and booking-derived detail lines.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/master-quotation`)}>
            Master Quotations
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadQuotations()} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </header>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <Card className="p-2 shadow-none">
        <ReportGrid
          title="Quotation Register"
          records={regularQuotations}
          fields={fields}
          visibleFields={visibleFields}
          onVisibleFieldsChange={(next) => setVisibleFields(next as QuotationField[])}
          storageKey={`distribution-quotation-report-columns:${organizationId}`}
          rowIdSelector={(quotation) => quotation.id}
          selectedIds={selectedIds}
          onToggleSelectAll={(checked) => setSelectedIds(checked ? regularQuotations.map((quotation) => quotation.id) : [])}
          onToggleRowSelection={(id, checked) => setSelectedIds((current) =>
            checked ? current.includes(id) ? current : [...current, id] : current.filter((value) => value !== id),
          )}
          onRowClick={(id) => openQuotation(id)}
          onRowAction={(id) => openQuotation(id)}
          rowActionLabel="Open Quotation"
          toolbarActions={(
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={Boolean(selectionError) || isLoading || isCreatingMaster}
              title={selectionError || undefined}
              onClick={() => void createMasterQuotation()}
            >
              {isCreatingMaster ? "Creating..." : `Create Master Quotation${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </Button>
          )}
          emptyMessage={isLoading ? "Loading quotations..." : "No ungrouped regular quotations are available. Create one from selected advance bookings."}
          renderCell={(fieldKey, quotation) => {
            if (fieldKey === "createdAt") return quotation.createdAt.slice(0, 10);
            const value = quotation[fieldKey as keyof DistributionQuotationSummary];
            return value === null || value === undefined ? "" : String(value);
          }}
        />
      </Card>
    </div>
  );
}
