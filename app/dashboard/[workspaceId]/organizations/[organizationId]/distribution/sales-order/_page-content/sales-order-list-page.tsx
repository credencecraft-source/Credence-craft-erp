"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ReportGrid } from "@/components/reports/report-grid-display";
import type { DistributionQuotationSummary } from "../../quotation/_page-content/quotation-types";

type SalesOrderRow = DistributionQuotationSummary & { childCount: number };
type SalesOrderField = "quotationNo" | "orderNo" | "customer" | "childCount" | "totalQuantity" | "subtotal" | "createdAt";

const fields: Array<{ key: SalesOrderField; label: string }> = [
  { key: "quotationNo", label: "Sales Order No" },
  { key: "orderNo", label: "Order No" },
  { key: "customer", label: "Customer" },
  { key: "childCount", label: "Child Quotations" },
  { key: "totalQuantity", label: "Total Qty" },
  { key: "subtotal", label: "Subtotal" },
  { key: "createdAt", label: "Created Date" },
];

export default function SalesOrderListPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const [quotations, setQuotations] = useState<DistributionQuotationSummary[]>([]);
  const [visibleFields, setVisibleFields] = useState<SalesOrderField[]>(fields.map(({ key }) => key));
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadQuotations = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/distribution/quotations?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.quotations)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load sales orders.");
      }
      setQuotations(data.quotations as DistributionQuotationSummary[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load sales orders.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQuotations(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQuotations]);
  const salesOrders = useMemo<SalesOrderRow[]>(() => quotations
    .filter((quotation) => quotation.mode === "MASTER")
    .map((quotation) => ({
      ...quotation,
      childCount: quotations.filter((child) => child.parentQuotationId === quotation.id).length,
    })), [quotations]);

  function openDetails(id: string) {
    router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/sales-order/${encodeURIComponent(id)}`);
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="erp-eyebrow">Distribution / Sales Order</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Sales Orders</h1>
          <p className="mt-2 text-sm text-slate-600">Persisted sales orders and linked quotations.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/distribution/quotation`)}>
            Quotation Register
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadQuotations()} disabled={isLoading}>Refresh</Button>
        </div>
      </header>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <Card className="p-2 shadow-none">
        <ReportGrid
          title="Sales Order Register"
          records={salesOrders}
          fields={fields}
          visibleFields={visibleFields}
          onVisibleFieldsChange={(next) => setVisibleFields(next as SalesOrderField[])}
          storageKey={`distribution-master-quotation-report-columns:${organizationId}`}
          rowIdSelector={(quotation) => quotation.id}
          selectedIds={[]}
          selectable={false}
          onRowClick={openDetails}
          onRowAction={openDetails}
          rowActionLabel="View Details"
          emptyMessage={isLoading ? "Loading sales orders..." : "No sales orders have been created."}
          renderCell={(fieldKey, quotation) => {
            if (fieldKey === "createdAt") return quotation.createdAt.slice(0, 10);
            const value = quotation[fieldKey as keyof SalesOrderRow];
            return value === null || value === undefined ? "" : String(value);
          }}
        />
      </Card>
    </div>
  );
}
