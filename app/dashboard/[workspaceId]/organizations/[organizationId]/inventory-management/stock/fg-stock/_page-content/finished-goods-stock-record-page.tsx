"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";

type StockRecord = {
  [key: string]: string | number | null | { location_name: string; entity_id?: string; division_id?: string } | { id: string; node_name: string } | undefined;
  id: string;
  location: { location_name: string; entity_id?: string; division_id?: string };
  storage_node_id?: string | null;
  storageNode?: { id: string; node_name: string } | null;
  added_time?: string;
  posted_at?: string;
};

type RecordType = "general" | "allocated";
type StorageOption = { id: string; label: string };

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
    return value && typeof value === "object" && "location_name" in value ? value.location_name : "-";
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
  const [subLocationOptions, setSubLocationOptions] = useState<StorageOption[]>([]);
  const [subSubLocationOptions, setSubSubLocationOptions] = useState<StorageOption[]>([]);
  const [selectedSubLocationId, setSelectedSubLocationId] = useState("");
  const [selectedSubSubLocationId, setSelectedSubSubLocationId] = useState("");
  const [storageLoading, setStorageLoading] = useState(true);
  const [mapping, setMapping] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [mappingMessage, setMappingMessage] = useState("");
  const [mappingRetry, setMappingRetry] = useState(0);
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
        if (payload.record.storage_node_id || params.recordType !== "general") setStorageLoading(false);
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

  useEffect(() => {
    if (params.recordType !== "general" || record?.storage_node_id || !record?.location.entity_id || !record.location.division_id) {
      return;
    }
    const controller = new AbortController();
    const path = `/api/organizations/${encodeURIComponent(params.organizationId)}/entities/${encodeURIComponent(record.location.entity_id)}/divisions/${encodeURIComponent(record.location.division_id)}/locations/${encodeURIComponent(String(record.location_id ?? ""))}/sub-locations`;
    void fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { error?: string; subLocations?: Array<{ id?: unknown; node_name?: unknown; is_active?: unknown }> };
        if (!response.ok || !Array.isArray(data.subLocations)) throw new Error(data.error || "Unable to load active Sub-locations.");
        return data.subLocations.filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.node_name === "string")
          .map((item) => ({ id: item.id as string, label: item.node_name as string }));
      })
      .then((options) => { if (!controller.signal.aborted) setSubLocationOptions(options); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setMappingError(cause instanceof Error ? cause.message : "Unable to load active Sub-locations.");
      })
      .finally(() => { if (!controller.signal.aborted) setStorageLoading(false); });
    return () => controller.abort();
  }, [mappingRetry, params.organizationId, params.recordType, record]);

  useEffect(() => {
    if (!selectedSubLocationId || !record?.location.entity_id || !record.location.division_id) {
      return;
    }
    const controller = new AbortController();
    const path = `/api/organizations/${encodeURIComponent(params.organizationId)}/entities/${encodeURIComponent(record.location.entity_id)}/divisions/${encodeURIComponent(record.location.division_id)}/locations/${encodeURIComponent(String(record.location_id ?? ""))}/sub-locations/${encodeURIComponent(selectedSubLocationId)}/sub-sub-locations`;
    void fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { error?: string; subSubLocations?: Array<{ id?: unknown; node_name?: unknown; is_active?: unknown }> };
        if (!response.ok || !Array.isArray(data.subSubLocations)) throw new Error(data.error || "Unable to load active Sub-sub-locations.");
        return data.subSubLocations.filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.node_name === "string")
          .map((item) => ({ id: item.id as string, label: item.node_name as string }));
      })
      .then((options) => { if (!controller.signal.aborted) setSubSubLocationOptions(options); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setMappingError(cause instanceof Error ? cause.message : "Unable to load active Sub-sub-locations.");
      })
      .finally(() => { if (!controller.signal.aborted) setStorageLoading(false); });
    return () => controller.abort();
  }, [mappingRetry, params.organizationId, record?.location, record?.location_id, selectedSubLocationId]);

  async function mapStockToSubSubLocation() {
    if (!record || !selectedSubSubLocationId || mapping) return;
    setMapping(true);
    setMappingError("");
    setMappingMessage("");
    try {
      const response = await fetch("/api/inventory/stock/fg-sku", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: params.organizationId,
          recordId: record.id,
          recordType: params.recordType,
          storageNodeId: selectedSubSubLocationId,
        }),
      });
      const data = await response.json() as { error?: string; record?: { storageNodeId?: string } };
      if (!response.ok) throw new Error(data.error || "Unable to map finished-goods stock.");
      const leaf = subSubLocationOptions.find((option) => option.id === selectedSubSubLocationId);
      setRecord({ ...record, storage_node_id: selectedSubSubLocationId, storageNode: { id: selectedSubSubLocationId, node_name: leaf?.label ?? "" } });
      setMappingMessage("Stock is now assigned to this active POS issue location.");
    } catch (cause) {
      setMappingError(cause instanceof Error ? cause.message : "Unable to map finished-goods stock.");
    } finally {
      setMapping(false);
    }
  }

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
        {record?.storage_node_id ? (
          <Card className="text-sm">
            <p className="font-semibold text-[var(--erp-text)]">POS issue location</p>
            <p className="mt-1 text-[var(--erp-muted)]">{record.storageNode?.node_name || "Assigned Sub-sub-location"}</p>
          </Card>
        ) : params.recordType === "general" && record ? (
          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--erp-text)]">Assign POS issue location</h2>
              <p className="mt-1 text-xs text-[var(--erp-muted)]">This existing balance is unavailable to POS until explicitly assigned to an active Sub-sub-location.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Sub-location"
                value={selectedSubLocationId}
                disabled={storageLoading || subLocationOptions.length === 0}
                onChange={(event) => {
                  setSelectedSubLocationId(event.target.value);
                  setSelectedSubSubLocationId("");
                  setSubSubLocationOptions([]);
                  setStorageLoading(Boolean(event.target.value));
                  setMappingError("");
                }}
                options={[
                  { value: "", label: storageLoading ? "Loading Sub-locations…" : subLocationOptions.length ? "Select Sub-location" : "No active Sub-locations" },
                  ...subLocationOptions.map((option) => ({ value: option.id, label: option.label })),
                ]}
              />
              <Select
                label="Sub-sub-location"
                value={selectedSubSubLocationId}
                disabled={storageLoading || !selectedSubLocationId || subSubLocationOptions.length === 0}
                onChange={(event) => {
                  setSelectedSubSubLocationId(event.target.value);
                  setMappingError("");
                }}
                options={[
                  { value: "", label: storageLoading ? "Loading Sub-sub-locations…" : subSubLocationOptions.length ? "Select POS issue location" : "No active Sub-sub-locations" },
                  ...subSubLocationOptions.map((option) => ({ value: option.id, label: option.label })),
                ]}
              />
            </div>
            {mappingError ? (
              <p role="alert" className="text-sm text-[var(--erp-danger)]">
                {mappingError}{" "}
                <Button type="button" variant="secondary" size="sm" onClick={() => {
                  setStorageLoading(true);
                  setMappingError("");
                  setMappingRetry((value) => value + 1);
                }}>
                  Retry
                </Button>
              </p>
            ) : null}
            {mappingMessage ? <p role="status" className="text-sm text-emerald-700">{mappingMessage}</p> : null}
            <Button type="button" disabled={!selectedSubSubLocationId || mapping} onClick={mapStockToSubSubLocation}>
              {mapping ? "Assigning…" : "Assign to POS issue location"}
            </Button>
          </Card>
        ) : null}
      </Section>
    </Page>
  );
}
