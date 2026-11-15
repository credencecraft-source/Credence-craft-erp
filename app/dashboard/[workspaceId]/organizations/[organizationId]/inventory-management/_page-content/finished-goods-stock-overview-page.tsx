"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Boxes, PackageCheck, RefreshCw, Store } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import {
  buildFinishedGoodsStockOverview,
  type FinishedGoodsStockOverview,
  type FinishedGoodsStockOverviewRow,
  type FinishedGoodsStockRecord,
} from "@/lib/services/inventory/finished-goods-stock-overview";

const fields = [
  { key: "main_source", label: "Main Source" },
  { key: "sub_source", label: "Sub Source" },
  { key: "stock_type", label: "Stock Type" },
  { key: "sku_code", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "style_name", label: "Style" },
  { key: "article_no", label: "Article" },
  { key: "brand", label: "Brand" },
  { key: "size", label: "Size" },
  { key: "colour", label: "Colour" },
  { key: "location", label: "Location" },
  { key: "qty_in", label: "Qty In" },
  { key: "qty_out", label: "Qty Out" },
  { key: "current_stock", label: "Current Stock" },
  { key: "added_time", label: "Posted At" },
];

const emptyOverview: FinishedGoodsStockOverview = {
  rows: [],
  total: 0,
  general: 0,
  allocated: 0,
  inventory: 0,
  pos: 0,
};

function formatQuantity(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function StockSummaryCard({
  label,
  value,
  description,
  icon,
}: {
  label: string;
  value: number;
  description: string;
  icon: "all" | "general" | "allocated";
}) {
  const Icon = icon === "all" ? Boxes : icon === "general" ? Store : PackageCheck;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--erp-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[var(--erp-text)]">{formatQuantity(value)}</p>
          <p className="mt-1 text-xs text-[var(--erp-muted)]">{description}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export default function FinishedGoodsStockOverviewPage() {
  const { workspaceId, organizationId } = useParams<{ workspaceId: string; organizationId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [overview, setOverview] = useState(emptyOverview);
  const [visibleFields, setVisibleFields] = useState<string[]>(fields.map(({ key }) => key));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/inventory/stock/fg-sku?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as { records?: FinishedGoodsStockRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load finished-goods stock.");
      if (!Array.isArray(payload.records)) throw new Error("Finished-goods stock response did not contain records.");
      setOverview(buildFinishedGoodsStockOverview(payload.records));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load finished-goods stock.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOverview]);

  const sourceTotals = useMemo(() => [
    { label: "Inventory", value: overview.inventory },
    { label: "POS", value: overview.pos },
  ], [overview.inventory, overview.pos]);
  const returnTo = encodeURIComponent(pathname);

  const openRecord = (reportId: string) => {
    const record = overview.rows.find((row) => row.report_id === reportId);
    if (!record) return;
    const basePath = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/inventory-management/stock/fg-stock`;
    if (record.inventory_bucket) {
      const recordType = record.inventory_bucket === "GENERAL" ? "general" : "allocated";
      router.push(`${basePath}/record/${recordType}/${encodeURIComponent(record.record_id)}?returnTo=${returnTo}`);
      return;
    }
    router.push(`${basePath}/sku/${encodeURIComponent(record.record_id)}?returnTo=${returnTo}`);
  };

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Inventory Management · Stock</p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--erp-text)]">Finished Goods Stock</h1>
            <p className="max-w-3xl text-sm text-[var(--erp-muted)]">
              One current-stock view across verified General and Allocated receipts and POS or inventory SKU stock.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadOverview()} disabled={loading}>
            <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </header>

        <div aria-label="Finished goods stock totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StockSummaryCard label="Total Current FG Stock" value={overview.total} description="Sum of remaining quantities across stock ledgers." icon="all" />
          <StockSummaryCard label="General FG Stock" value={overview.general} description="Unallocated stock available by source." icon="general" />
          <StockSummaryCard label="Allocated FG Stock" value={overview.allocated} description="Stock reserved to bookings or orders." icon="allocated" />
        </div>

        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Stock by main source</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">Each stock record is counted once using its current balance.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {sourceTotals.map(({ label, value }) => {
                const sourceLabel = label === "Inventory" ? "Inventory Module" : "POS Module";
                const share = overview.total > 0 ? Math.min(100, Math.max(0, (value / overview.total) * 100)) : 0;
                return (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[var(--erp-text)]">{sourceLabel}</span>
                      <span className="text-[var(--erp-muted)]">{formatQuantity(value)} · {share.toFixed(1)}%</span>
                    </div>
                    <div
                      role="meter"
                      aria-label={`${sourceLabel} share of current finished-goods stock`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={share}
                      className="h-2 overflow-hidden rounded-full bg-[var(--erp-brand-soft)]"
                    >
                      <div className="h-full rounded-full bg-[var(--erp-brand)]" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {error ? (
          <Card role="alert" className="space-y-3">
            <p className="text-sm text-[var(--erp-error-text)]">{error}</p>
            <Button type="button" variant="secondary" onClick={() => void loadOverview()}>Retry</Button>
          </Card>
        ) : null}

        <Card className="min-w-0">
          <ReportGrid<FinishedGoodsStockOverviewRow>
            title="Centralized Finished Goods Stock"
            records={overview.rows}
            fields={fields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(nextFields) => setVisibleFields(nextFields.map(String))}
            storageKey={`finished-goods-central-stock-${organizationId}`}
            rowIdSelector={(record) => record.report_id}
            selectedIds={[]}
            selectable={false}
            onRowClick={openRecord}
            isLoading={loading}
            emptyMessage={loading ? "Loading finished-goods stock..." : "No finished-goods stock records are available."}
            getSearchValue={(fieldKey, record) => fieldKey === "location"
              ? record.location?.location_name ?? ""
              : String(record[fieldKey as keyof FinishedGoodsStockOverviewRow] ?? "")}
            renderCell={(fieldKey, record) => {
              if (fieldKey === "main_source") return <Badge>{record.main_source}</Badge>;
              if (fieldKey === "sub_source") return record.sub_source;
              if (fieldKey === "stock_type") return <Badge>{record.stock_type.replaceAll("_", " ")}</Badge>;
              if (fieldKey === "location") return record.location?.location_name ?? "—";
              if (fieldKey === "added_time") {
                return record.added_time ? new Date(record.added_time).toLocaleString("en-IN") : "—";
              }
              if (fieldKey === "current_stock" || fieldKey === "qty_in" || fieldKey === "qty_out") {
                return formatQuantity(record[fieldKey]);
              }
              const value = record[fieldKey as keyof FinishedGoodsStockOverviewRow];
              return value === null || value === undefined || value === "" ? "—" : String(value);
            }}
          />
        </Card>
      </Section>
    </Page>
  );
}
