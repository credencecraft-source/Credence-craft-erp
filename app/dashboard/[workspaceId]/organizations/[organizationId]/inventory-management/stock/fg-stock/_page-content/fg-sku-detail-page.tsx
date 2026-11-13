"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";

type Option = { id: string; label: string; fields?: Record<string, unknown> };
type LocationOption = { id: string; label: string };
type StockRecord = {
  id: string;
  entity_id: string;
  location_id: string;
  purchase_bill_line_id: string | null;
  location: {
    location_name: string;
    division_id?: string;
    entity?: { entity_name: string };
  } | null;
  storage_node_id?: string | null;
  storageNode?: { id: string; node_name: string } | null;
  sku_code: string | null;
  barcode: string | null;
  style_name: string;
  order_no: string;
  article_no: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  product_category: string | null;
  sub_product_category: string | null;
  gst_rate: string | number | null;
  hsn_code: string | null;
  purchase_price: string | number | null;
  sales_price: string | number | null;
  mrp: string | number | null;
  added_time: string;
  added_user: string;
  source: string;
  qty_in: string | number;
  qty_out: string | number;
  current_stock: string | number;
};
type FormState = {
  locationId: string;
  styleName: string;
  orderNo: string;
  articleNo: string;
  barcode: string;
  brand: string;
  size: string;
  colour: string;
  productCategory: string;
  subProductCategory: string;
  gstRate: string;
  hsnCode: string;
  purchasePrice: string;
  salesPrice: string;
  mrp: string;
  source: string;
  qtyIn: string;
  qtyOut: string;
};

const textFields: Array<[keyof FormState, string]> = [
  ["brand", "Brand"],
  ["size", "Size"],
  ["colour", "Colour"],
  ["productCategory", "Product Category"],
  ["subProductCategory", "Sub Product Category"],
];
const numberFields: Array<[keyof FormState, string]> = [
  ["purchasePrice", "Purchase Price"],
  ["salesPrice", "Sales Price"],
  ["mrp", "MRP"],
  ["qtyIn", "Qty In"],
  ["qtyOut", "Qty Out"],
];
const readOnlyFields: Array<[keyof StockRecord, string]> = [
  ["id", "Stock Record ID"],
  ["sku_code", "SKU Code"],
  ["barcode", "Customer Barcode"],
  ["entity_id", "Site"],
  ["location_id", "Location Record ID"],
  ["location", "Location"],
  ["style_name", "Style Name"],
  ["order_no", "Order No"],
  ["article_no", "Article No"],
  ["brand", "Brand"],
  ["size", "Size"],
  ["colour", "Colour"],
  ["product_category", "Product Category"],
  ["sub_product_category", "Sub Product Category"],
  ["source", "Source"],
  ["qty_in", "Qty In"],
  ["qty_out", "Qty Out"],
  ["current_stock", "Current Stock"],
  ["gst_rate", "GST %"],
  ["hsn_code", "HSN Code"],
  ["purchase_price", "Purchase Price"],
  ["sales_price", "Sales Price"],
  ["mrp", "MRP"],
  ["added_time", "Added Time"],
  ["added_user", "Added By"],
  ["purchase_bill_line_id", "Purchase Bill Line ID"],
];

function toForm(record: StockRecord): FormState {
  return {
    locationId: record.location_id ?? "",
    styleName: record.style_name,
    orderNo: record.order_no,
    articleNo: record.article_no,
    barcode: record.barcode ?? "",
    brand: record.brand ?? "",
    size: record.size ?? "",
    colour: record.colour ?? "",
    productCategory: record.product_category ?? "",
    subProductCategory: record.sub_product_category ?? "",
    gstRate: record.gst_rate == null ? "" : String(record.gst_rate),
    hsnCode: record.hsn_code ?? "",
    purchasePrice: record.purchase_price == null ? "" : String(record.purchase_price),
    salesPrice: record.sales_price == null ? "" : String(record.sales_price),
    mrp: record.mrp == null ? "" : String(record.mrp),
    source: record.source,
    qtyIn: String(record.qty_in),
    qtyOut: String(record.qty_out),
  };
}

function displayValue(record: StockRecord, key: keyof StockRecord) {
  const value = record[key];
  if (key === "entity_id") return record.location?.entity?.entity_name ?? "-";
  if (key === "location") return record.location?.location_name ?? "-";
  if (key === "added_time") return new Date(record.added_time).toLocaleString("en-IN");
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export default function FgSkuDetailPage({
  workspaceId,
  organizationId,
  skuId,
}: {
  workspaceId: string;
  organizationId: string;
  skuId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [record, setRecord] = useState<StockRecord | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [gstOptions, setGstOptions] = useState<Option[]>([]);
  const [hsnOptions, setHsnOptions] = useState<Option[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [subLocationOptions, setSubLocationOptions] = useState<LocationOption[]>([]);
  const [subSubLocationOptions, setSubSubLocationOptions] = useState<LocationOption[]>([]);
  const [mappingSubLocationId, setMappingSubLocationId] = useState("");
  const [mappingSubSubLocationId, setMappingSubSubLocationId] = useState("");
  const [mappingLocationsLoading, setMappingLocationsLoading] = useState(true);
  const [mappingSaving, setMappingSaving] = useState(false);
  const lookupRequest = useRef<Promise<void> | null>(null);
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/stock/fg-stock`;
  const requestedReturnTo = searchParams.get("returnTo");
  const allowedReturnPaths = [
    `${basePath}/sku`,
    `${basePath}/general-stock`,
    `${basePath}/allocated-stock`,
    `${basePath}/tags`,
    `${basePath}/carton-box`,
  ];
  const returnTo = requestedReturnTo && allowedReturnPaths.includes(requestedReturnTo)
    ? requestedReturnTo
    : `${basePath}/sku`;
  const usesPosIdentifiers = ["DIRECT_FROM_POS", "POS", "POS_PURCHASE_BILL"].includes(
    record?.source ?? "",
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/inventory/stock/fg-sku?organizationId=${encodeURIComponent(organizationId)}&barcode=${encodeURIComponent(skuId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.record) throw new Error(data.error || "Unable to load finished-goods SKU.");
        const loadedRecord = data.record as StockRecord;
        if (loadedRecord.storage_node_id) setMappingLocationsLoading(false);
        setRecord(loadedRecord);
        setForm(toForm(loadedRecord));
        setCanEdit(data.canEdit === true);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load finished-goods SKU.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, skuId, reloadKey]);

  useEffect(() => {
    if (!record || record.storage_node_id || !record.location?.division_id) return;
    const controller = new AbortController();
    const path = `/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(record.entity_id)}/divisions/${encodeURIComponent(record.location.division_id)}/locations/${encodeURIComponent(record.location_id)}/sub-locations`;
    void fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { error?: string; subLocations?: Array<{ id?: unknown; node_name?: unknown; is_active?: unknown }> };
        if (!response.ok || !Array.isArray(data.subLocations)) throw new Error(data.error || "Unable to load active Sub-locations.");
        return data.subLocations.filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.node_name === "string")
          .map((item) => ({ id: item.id as string, label: item.node_name as string }));
      })
      .then((options) => { if (!controller.signal.aborted) setSubLocationOptions(options); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load active Sub-locations."); })
      .finally(() => { if (!controller.signal.aborted) setMappingLocationsLoading(false); });
    return () => controller.abort();
  }, [organizationId, record]);

  useEffect(() => {
    if (!record || !mappingSubLocationId || !record.location?.division_id) return;
    const controller = new AbortController();
    const path = `/api/organizations/${encodeURIComponent(organizationId)}/entities/${encodeURIComponent(record.entity_id)}/divisions/${encodeURIComponent(record.location.division_id)}/locations/${encodeURIComponent(record.location_id)}/sub-locations/${encodeURIComponent(mappingSubLocationId)}/sub-sub-locations`;
    void fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { error?: string; subSubLocations?: Array<{ id?: unknown; node_name?: unknown; is_active?: unknown }> };
        if (!response.ok || !Array.isArray(data.subSubLocations)) throw new Error(data.error || "Unable to load active Sub-sub-locations.");
        return data.subSubLocations.filter((item) => item.is_active === true && typeof item.id === "string" && typeof item.node_name === "string")
          .map((item) => ({ id: item.id as string, label: item.node_name as string }));
      })
      .then((options) => { if (!controller.signal.aborted) setSubSubLocationOptions(options); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load active Sub-sub-locations."); })
      .finally(() => { if (!controller.signal.aborted) setMappingLocationsLoading(false); });
    return () => controller.abort();
  }, [mappingSubLocationId, organizationId, record]);

  async function mapExistingSkuToSubSubLocation() {
    if (!record || !mappingSubSubLocationId || mappingSaving) return;
    setMappingSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/inventory/stock/fg-sku", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          recordId: record.id,
          recordType: "sku",
          storageNodeId: mappingSubSubLocationId,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to map finished-goods stock.");
      const leaf = subSubLocationOptions.find((option) => option.id === mappingSubSubLocationId);
      setRecord({ ...record, storage_node_id: mappingSubSubLocationId, storageNode: { id: mappingSubSubLocationId, node_name: leaf?.label ?? "" } });
      setMessage("Stock is now assigned to this active POS issue location.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to map finished-goods stock.");
    } finally {
      setMappingSaving(false);
    }
  }

  const loadEditLookups = useCallback(() => {
    if (lookupsLoaded) return Promise.resolve();
    if (lookupRequest.current) return lookupRequest.current;

    setLookupsLoading(true);
    setError("");
    lookupRequest.current = Promise.all([
      fetch(`/api/masters?organizationId=${encodeURIComponent(organizationId)}&moduleKeys=gst,hsn`, { cache: "no-store" }),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/location?includeInactive=false`, { cache: "no-store" }),
    ])
      .then(async ([masterResponse, locationResponse]) => {
        if (!masterResponse.ok || !locationResponse.ok) {
          throw new Error("Unable to load SKU edit lookups. Retry to load the required fields.");
        }
        const [masterData, locationData] = await Promise.all([masterResponse.json(), locationResponse.json()]);
        if (
          !Array.isArray(masterData.masters)
          || masterData.masters.some((master: { values?: unknown }) => !Array.isArray(master.values))
          || !Array.isArray(locationData)
        ) {
          throw new Error("SKU edit lookup data is unavailable. Retry to load the required fields.");
        }
        const masterMap = Object.fromEntries(
          masterData.masters.map((master: { module_key: string; values: Option[] }) => [master.module_key, master.values]),
        );
        setGstOptions(masterMap.gst ?? []);
        setHsnOptions(masterMap.hsn ?? []);
        setLocations(locationData);
        setLookupsLoaded(true);
      })
      .catch((lookupError: unknown) => {
        setError(lookupError instanceof Error ? lookupError.message : "Unable to load SKU edit lookups.");
      })
      .finally(() => {
        setLookupsLoading(false);
        lookupRequest.current = null;
      });
    return lookupRequest.current;
  }, [lookupsLoaded, organizationId]);

  const beginEdit = () => {
    if (!record) return;
    setForm(toForm(record));
    setMessage("");
    setEditing(true);
    void loadEditLookups();
  };

  const cancelEdit = () => {
    if (record) setForm(toForm(record));
    setEditing(false);
    setError("");
  };

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || !record) return;
    if (!form.locationId) {
      setError("Select an active Location before saving the stock record.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/inventory/stock/fg-sku", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          recordId: record.id,
          ...form,
          locationId: form.locationId,
          qtyIn: Number(form.qtyIn || 0),
          qtyOut: Number(form.qtyOut || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.record) {
        throw new Error(data.error || "Unable to save finished-goods SKU.");
      }
      const savedRecord = data.record as StockRecord;
      setRecord(savedRecord);
      setForm(toForm(savedRecord));
      setEditing(false);
      setMessage("Finished-goods SKU updated.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save finished-goods SKU.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Stock / Finished Goods</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">
              Finished Goods SKU: {record?.sku_code || skuId}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push(returnTo)}>
              Back to Stock Register
            </Button>
            {record && !editing ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(
                  `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/outward/fg-issued?skuStockId=${encodeURIComponent(record.id)}`,
                )}
              >
                View Stock History
              </Button>
            ) : null}
            {record && canEdit && !editing ? (
              <Button type="button" onClick={beginEdit}>Edit</Button>
            ) : null}
            {record && editing ? (
              <>
                <Button type="button" variant="secondary" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" form="fg-sku-edit-form" disabled={saving || lookupsLoading || !lookupsLoaded}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : null}
          </div>
        </header>
        {loading ? <p role="status" className="text-sm text-[var(--erp-muted)]">Loading SKU details...</p> : null}
        {error ? (
          <Card role="alert" className="space-y-3 text-sm">
            <p>{error}</p>
            {!record ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setReloadKey((key) => key + 1);
                }}
              >
                Retry
              </Button>
            ) : editing && !lookupsLoaded ? (
              <Button type="button" variant="secondary" onClick={() => void loadEditLookups()} disabled={lookupsLoading}>
                {lookupsLoading ? "Loading lookups..." : "Retry lookups"}
              </Button>
            ) : null}
          </Card>
        ) : null}
        {message ? <p role="status" className="text-sm font-medium text-[var(--erp-success-text)]">{message}</p> : null}

        {record && !editing ? (
          <>
            <Card className="space-y-4">
              <h2 className="text-base font-semibold text-[var(--erp-text)]">
                Location/Site → Warehouse → Sub-store → Rack → Bin
              </h2>
              <p className="text-sm text-[var(--erp-text-muted)]">
                POS issue stock is independently assigned to a Sub-sub-location. Other storage levels are not linked to this stock record.
              </p>
              <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Location/Site", record.location?.entity?.entity_name ?? "-"],
                  ["Warehouse", "Not assigned to this stock record"],
                  ["POS Sub-sub-location", record.storageNode?.node_name ?? "Not assigned"],
                  ["Rack", "Not assigned to this stock record"],
                  ["Bin", "Not assigned to this stock record"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            {!record.storage_node_id && canEdit ? (
              <Card className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--erp-text)]">Assign existing balance to a POS issue location</h2>
                  <p className="mt-1 text-xs text-[var(--erp-muted)]">This balance remains unavailable to POS until explicitly assigned to an active Sub-sub-location.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Sub-location"
                    value={mappingSubLocationId}
                    disabled={mappingLocationsLoading || subLocationOptions.length === 0}
                    onChange={(event) => {
                      setMappingSubLocationId(event.target.value);
                      setMappingSubSubLocationId("");
                      setSubSubLocationOptions([]);
                      setMappingLocationsLoading(Boolean(event.target.value));
                    }}
                    options={[
                      { value: "", label: mappingLocationsLoading ? "Loading Sub-locations…" : subLocationOptions.length ? "Select Sub-location" : "No active Sub-locations" },
                      ...subLocationOptions.map((option) => ({ value: option.id, label: option.label })),
                    ]}
                  />
                  <Select
                    label="Sub-sub-location"
                    value={mappingSubSubLocationId}
                    disabled={mappingLocationsLoading || !mappingSubLocationId || subSubLocationOptions.length === 0}
                    onChange={(event) => setMappingSubSubLocationId(event.target.value)}
                    options={[
                      { value: "", label: mappingLocationsLoading ? "Loading Sub-sub-locations…" : subSubLocationOptions.length ? "Select POS issue location" : "No active Sub-sub-locations" },
                      ...subSubLocationOptions.map((option) => ({ value: option.id, label: option.label })),
                    ]}
                  />
                </div>
                <Button type="button" disabled={!mappingSubSubLocationId || mappingSaving} onClick={() => void mapExistingSkuToSubSubLocation()}>
                  {mappingSaving ? "Assigning…" : "Assign to POS issue location"}
                </Button>
              </Card>
            ) : null}
            <Card>
              <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {readOnlyFields.map(([key, label]) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-xs font-semibold text-[var(--erp-muted)]">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{displayValue(record, key) || "-"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </>
        ) : null}

        {record && editing && form ? (
          <Card>
            <form id="fg-sku-edit-form" onSubmit={save} className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="SKU Code" disabled value={record.sku_code || "-"} />
              <Input
                label={usesPosIdentifiers ? "Generated Barcode" : "Customer Barcode"}
                disabled={usesPosIdentifiers}
                value={form.barcode}
                onChange={(event) => update("barcode", event.target.value)}
              />
              <Select
                label="Location"
                required
                value={form.locationId}
                disabled={lookupsLoading || !lookupsLoaded}
                onChange={(event) => update("locationId", event.target.value)}
                options={[
                  { value: "", label: lookupsLoading ? "Loading locations..." : "Select Location" },
                  ...locations.map((location) => ({ value: location.id, label: location.label })),
                ]}
              />
              <Input label="Style Name" required value={form.styleName} onChange={(event) => update("styleName", event.target.value)} />
              <Input label="Order No" required value={form.orderNo} onChange={(event) => update("orderNo", event.target.value)} />
              <Input label="Article No" required value={form.articleNo} onChange={(event) => update("articleNo", event.target.value)} />
              {textFields.map(([key, label]) => (
                <Input key={key} label={label} value={form[key]} onChange={(event) => update(key, event.target.value)} />
              ))}
              <Select
                label="GST %"
                value={form.gstRate}
                disabled={lookupsLoading || !lookupsLoaded}
                onChange={(event) => update("gstRate", event.target.value)}
                options={[
                  { value: "", label: lookupsLoading ? "Loading GST rates..." : "Select GST" },
                  ...gstOptions.map((option) => ({
                    value: String(option.fields?.Gst ?? option.fields?.gst ?? option.label),
                    label: `${option.label} (${String(option.fields?.Gst ?? option.fields?.gst ?? "-")}%)`,
                  })),
                ]}
              />
              <Select
                label="HSN Code"
                value={form.hsnCode}
                disabled={lookupsLoading || !lookupsLoaded}
                onChange={(event) => update("hsnCode", event.target.value)}
                options={[
                  { value: "", label: lookupsLoading ? "Loading HSN codes..." : "Select HSN" },
                  ...hsnOptions.map((option) => ({ value: option.label, label: option.label })),
                ]}
              />
              {numberFields.map(([key, label]) => (
                <Input
                  key={key}
                  label={label}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[key]}
                  onChange={(event) => update(key, event.target.value)}
                />
              ))}
              <Select
                label="Source"
                value={form.source}
                onChange={(event) => update("source", event.target.value)}
                options={[
                  { value: "DIRECT", label: "Direct from Inventory" },
                  { value: "DIRECT_FROM_INVENTORY", label: "Direct from Inventory" },
                  { value: "DIRECT_FROM_POS", label: "Direct from POS" },
                  { value: "PACKING_LIST_GRN", label: "Packing List GRN" },
                  { value: "POS_PURCHASE_BILL", label: "POS" },
                ]}
              />
            </form>
          </Card>
        ) : null}
      </Section>
    </Page>
  );
}
