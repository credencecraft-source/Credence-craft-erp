"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type StockRecord = {
  [key: string]: string | number | null | { location_name: string } | undefined;
  id: string;
  location: { location_name: string };
  added_time?: string;
  posted_at?: string;
};

type RecordType = "general" | "allocated";

const detailFields = [
  ["id", "Record ID"],
  ["inventory_bucket", "Stock Type"],
  ["source", "Source"],
  ["location", "Location"],
  ["sku_code", "SKU Code"],
  ["barcode", "Customer Barcode"],
  ["style_name", "Style Name"],
  ["order_no", "Order No"],
  ["order_id", "Order ID"],
  ["article_no", "Article No / Style No"],
  ["work_order_no", "Work Order No"],
  ["work_order_id", "Work Order ID"],
  ["grn_no", "GRN No"],
  ["grn_id", "GRN ID"],
  ["grn_line_id", "GRN Line ID"],
  ["booking_no", "Booking No"],
  ["booking_id", "Booking ID"],
  ["booking_size_line_id", "Booking Size Line ID"],
  ["booking_assignment_id", "Booking Assignment ID"],
  ["brand", "Brand"],
  ["size", "Size"],
  ["buyer_size", "Buyer Size"],
  ["colour", "Colour"],
  ["product_category", "Product Category"],
  ["sub_product_category", "Sub Product Category"],
  ["buyer", "Buyer"],
  ["received_quantity", "GRN Submitted Qty"],
  ["actual_received_quantity", "GRN Actual Qty"],
  ["approved_quantity", "GRN Approved Qty"],
  ["rejected_quantity", "GRN Rejected Qty"],
  ["qty_in", "Qty In"],
  ["qty_out", "Qty Out"],
  ["current_stock", "Current Stock"],
  ["gst_rate", "GST %"],
  ["hsn_code", "HSN Code"],
  ["purchase_price", "Purchase Price"],
  ["sales_price", "Sales Price"],
  ["mrp", "MRP"],
  ["added_time", "Added Time"],
  ["posted_at", "Posted At"],
  ["added_user", "Added User Email"],
  ["created_by", "GRN Submitted By Email"],
  ["verified_by", "GRN Verified By Email"],
] as const;

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value || "-"}</dd>
    </div>
  );
}

function formatStockValue(key: string, value: StockRecord[string]) {
  if (key === "location") {
    return value && typeof value === "object" ? value.location_name : "-";
  }
  if (key === "added_time" || key === "posted_at") {
    return value ? new Date(String(value)).toLocaleString("en-IN") : "-";
  }
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (key === "inventory_bucket" && typeof value === "string") {
    return value.replaceAll("_", " ");
  }
  return String(value);
}

export default function FinishedGoodsStockRecordPage() {
  const params = useParams<{
    workspaceId: string;
    organizationId: string;
    recordType: RecordType;
    recordId: string;
  }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [record, setRecord] = useState<StockRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const basePath = `/dashboard/${params.workspaceId}/organizations/${params.organizationId}/inventory-management/stock/fg-stock`;
  const defaultReportPath = `${basePath}/${params.recordType === "general" ? "general-stock" : "allocated-stock"}`;
  const returnTo = searchParams.get("returnTo");
  const reportPath = useMemo(() => {
    const validPaths = [
      `${basePath}/general-stock`,
      `${basePath}/allocated-stock`,
      `${basePath}/sku`,
      `${basePath}/tags`,
      `${basePath}/carton-box`,
    ];
    return returnTo && validPaths.includes(returnTo) ? returnTo : defaultReportPath;
  }, [basePath, defaultReportPath, returnTo]);
  const recordCaption = record ? String(record.grn_no || record.sku_code || record.id) : "";

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      organizationId: params.organizationId,
      recordType: params.recordType,
      recordId: params.recordId,
    });
    fetch(`/api/inventory/stock/fg-sku?${query.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.record) {
          throw new Error(payload.error || "Unable to load finished-goods stock record.");
        }
        setRecord(payload.record as StockRecord);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load finished-goods stock record.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.organizationId, params.recordId, params.recordType, reloadKey]);

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Stock / Finished Goods</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">Finished Goods Stock Record</h1>
            {record ? <p className="mt-1 text-sm text-[var(--erp-muted)]">{recordCaption}</p> : null}
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>
            Back to Stock Register
          </Button>
        </header>
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading stock record...</p> : null}
        {error ? (
          <Card role="alert" className="space-y-3 text-sm">
            <p>{error}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError("");
                setRecord(null);
                setReloadKey((key) => key + 1);
              }}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        {record ? (
          <Card>
            <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {detailFields.map(([key, label]) => {
                const displayValue = formatStockValue(key, record[key]);
                return <DetailField key={key} label={label} value={displayValue} />;
              })}
            </dl>
          </Card>
        ) : null}
      </Section>
    </Page>
  );
}
