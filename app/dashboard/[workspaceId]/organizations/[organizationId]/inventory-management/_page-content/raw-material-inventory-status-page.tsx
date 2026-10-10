"use client";

import { useState } from "react";
import { Boxes } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import type { RawMaterialInventoryStatusRow } from "@/lib/services/inventory/raw-material-inventory-status-service";

const ageBuckets = [
  { key: "days0To30Value", label: "Value · 0–30 days" },
  { key: "days31To60Value", label: "Value · 31–60 days" },
  { key: "days61To90Value", label: "Value · 61–90 days" },
  { key: "daysOver90Value", label: "Value · over 90 days" },
] as const;

const fields = [
  { key: "category", label: "Raw-material category" },
  { key: "totalValue", label: "Total value in stock" },
  ...ageBuckets.map(({ key, label }) => ({ key, label })),
  { key: "unpricedQuantity", label: "On-hand quantity without price" },
];

function formatQuantity(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatValue(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

export default function RawMaterialInventoryStatusPage({
  rows,
  organizationId,
}: {
  rows: RawMaterialInventoryStatusRow[];
  organizationId: string;
}) {
  const [visibleFields, setVisibleFields] = useState<(keyof RawMaterialInventoryStatusRow | string)[]>(
    fields.map(({ key }) => key),
  );

  return (
    <Page as="div">
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Inventory Management · Stock</p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--erp-text)]">Raw Material Inventory Value Aging</h1>
            <p className="max-w-3xl text-sm text-[var(--erp-muted)]">
              Total raw-material stock value by category, split into simple age bands.
            </p>
          </div>
          <Badge className="gap-1.5">
            <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
            {rows.length} categories
          </Badge>
        </div>

        <Card>
          <ReportGrid
            title="Inventory value by category and age"
            records={rows}
            fields={fields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={setVisibleFields}
            storageKey={`credence-craft-raw-material-inventory-status-${organizationId}`}
            rowIdSelector={(row) => row.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={() => undefined}
            emptyMessage="No raw-material stock is available for this organization."
            getSearchValue={(fieldKey, row) => String(row[fieldKey as keyof RawMaterialInventoryStatusRow] ?? "")}
            renderCell={(fieldKey, row) => {
              if (fieldKey === "category") return row.category;
              const value = row[fieldKey as keyof RawMaterialInventoryStatusRow];
              if (typeof value !== "number") return "—";
              return fieldKey === "unpricedQuantity" ? formatQuantity(value) : formatValue(value);
            }}
          />
          <p className="px-4 pb-4 text-xs text-[var(--erp-muted)]">
            Age is measured from the receipt date, or stock creation date when no receipt is linked. Values use the purchase-order unit price, with opening-stock price as a fallback. Stock without an available price is excluded from value totals and its quantity is shown separately.
          </p>
        </Card>
      </Section>
    </Page>
  );
}
