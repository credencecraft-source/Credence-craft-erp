"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import { buildPosStockSkuCode } from "@/lib/services/pos/pos-stock-identifiers";


type MasterValue = { id: string; label: string; fields?: Record<string, unknown> };
type LocationOption = { id: string; label: string };
type StockRecord = {
  id: string;
  location_id: string;
  location: { location_name: string };
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
  added_time: string;
  added_user: string;
  source: string;
  main_source: "Inventory Module" | "POS Module";
  sub_source: "WO Order GRN" | "Packing List GRN" | "POS Bill" | "—";
  qty_in: string | number;
  qty_out: string | number;
  current_stock: string | number;
  gst_rate: string | number | null;
  hsn_code: string | null;
  purchase_price: string | number | null;
  sales_price: string | number | null;
  mrp: string | number | null;
  inventory_bucket?: "GENERAL" | "ALLOCATED";
  grn_id?: string;
  grn_line_id?: string;
  grn_no?: string;
  work_order_id?: string;
  work_order_no?: string;
  order_id?: string;
  booking_id?: string;
  booking_size_line_id?: string;
  booking_assignment_id?: string;
  booking_no?: string;
  buyer?: string | null;
  buyer_size?: string | null;
  received_quantity?: number;
  actual_received_quantity?: number;
  approved_quantity?: number;
  rejected_quantity?: number;
  created_by?: string;
  verified_by?: string;
  posted_at?: string;
};

type FormState = {
  locationId: string;
  styleName: string;
  orderNo: string;
  articleNo: string;
  brand: string;
  size: string;
  colour: string;
  productCategory: string;
  subProductCategory: string;
  source: string;
  qtyIn: string;
  qtyOut: string;
  gstRate: string;
  hsnCode: string;
  purchasePrice: string;
  salesPrice: string;
  mrp: string;
  barcode: string;
};

const DIRECT_SOURCES = ["DIRECT", "DIRECT_FROM_INVENTORY", "DIRECT_FROM_POS"] as const;
const GENERAL_STOCK_SOURCES = [
  ...DIRECT_SOURCES,
  "PACKING_LIST_GRN",
  "POS",
  "POS_PURCHASE_BILL",
] as const;

function isDirectSource(source: string) {
  return DIRECT_SOURCES.includes(source as (typeof DIRECT_SOURCES)[number]);
}

function isGeneralStockSource(source: string) {
  return GENERAL_STOCK_SOURCES.includes(source as (typeof GENERAL_STOCK_SOURCES)[number]);
}

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function emptyForm(source: string): FormState {
  return {
    locationId: "", styleName: "", orderNo: "", articleNo: "", brand: "", size: "", colour: "",
    productCategory: "", subProductCategory: "", source, qtyIn: "", qtyOut: "",
    gstRate: "", hsnCode: "", purchasePrice: "", salesPrice: "", mrp: "", barcode: "",
  };
}

const inventorySourceOptions = [
  ["DIRECT_FROM_INVENTORY", "Direct from Inventory"],
  ["PACKING_LIST_GRN", "Packing List GRN"],
] as const;

const posSourceOptions = [
  ["DIRECT_FROM_POS", "Direct from POS"],
] as const;

const sourceLabels: Record<string, string> = {
  DIRECT: "Direct from Inventory",
  DIRECT_FROM_INVENTORY: "Direct from Inventory",
  DIRECT_FROM_POS: "Direct from POS",
  PACKING_LIST_GRN: "Packing List GRN",
  POS: "POS",
  POS_PURCHASE_BILL: "POS",
  WO_ORDER_GRN: "Work Order GRN",
  WORK_ORDER_GRN: "Work Order GRN",
};

function directItemName(form: FormState) {
  return [form.productCategory, form.subProductCategory, form.brand, form.size, form.colour].filter(Boolean).join(" - ") || "Generated from catalogue selections";
}

function MasterSelect({ label, value, options, onChange, required = false }: { label: string; value: string; options: MasterValue[]; onChange: (value: string) => void; required?: boolean }) {
  return (
    <Select label={label} required={required} value={value} onChange={(event) => onChange(event.target.value)} options={[{ value: "", label: `Select ${label}` }, ...options.map((option) => ({ value: option.label, label: option.label }))]} className="rounded-lg" />
  );
}

export default function FgStockModulePage({ moduleName, addMode = false, allocatedOnly = false, posMode = false }: { moduleName: string; addMode?: boolean; allocatedOnly?: boolean; posMode?: boolean }) {
  const { workspaceId, organizationId } = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [form, setForm] = useState<FormState>(() => emptyForm(posMode ? "DIRECT_FROM_POS" : "DIRECT_FROM_INVENTORY"));
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [masters, setMasters] = useState<Record<string, MasterValue[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lastGeneratedSkuId, setLastGeneratedSkuId] = useState("");
  const [showForm, setShowForm] = useState(addMode);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);

  const currentStock = Math.max(0, Number(form.qtyIn || 0) - Number(form.qtyOut || 0));
  const generatedPosSku = posMode
    ? buildPosStockSkuCode(form.styleName, form.colour, form.size)
    : null;
  const loadData = useCallback(async () => {
    setLoading(true);
    const stockQuery = new URLSearchParams({ organizationId });
    if (allocatedOnly) stockQuery.set("bucket", "ALLOCATED");
    else if (moduleName === "General Stock") stockQuery.set("bucket", "GENERAL");
    if (posMode) stockQuery.set("surface", "POS");
    const [stockResponse, masterResponse, locationsResponse] = await Promise.all([
      fetch(`/api/inventory/stock/fg-sku?${stockQuery.toString()}`, { cache: "no-store" }),
      fetch(`/api/masters?organizationId=${encodeURIComponent(organizationId)}&moduleKeys=sub-category`, { cache: "no-store" }),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/location?includeInactive=false`, { cache: "no-store" }),
    ]);
    const stockPayload = await stockResponse.json();
    const masterPayload = await masterResponse.json();
    const locationsPayload = await locationsResponse.json();
    setRecords(stockPayload.records ?? []);
    setLocations(Array.isArray(locationsPayload) ? locationsPayload : []);
    setMasters(Object.fromEntries((masterPayload.masters ?? []).map((master: { module_key: string; values: MasterValue[] }) => [master.module_key, master.values])));
    setLoading(false);
  }, [allocatedOnly, moduleName, organizationId, posMode]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  const sortedRecords = useMemo(() => {
    if (allocatedOnly) {
      return records.filter((record) => record.inventory_bucket === "ALLOCATED"
        || (!record.inventory_bucket && !isDirectSource(record.source) && record.order_no.trim().length > 0));
    }
    if (moduleName === "General Stock") {
      return records.filter((record) => record.inventory_bucket
        ? record.inventory_bucket === "GENERAL"
        : isGeneralStockSource(record.source) || record.order_no.trim().length === 0);
    }
    return records;
  }, [allocatedOnly, moduleName, records]);
  const reportFields = posMode ? [
    { key: "main_source", label: "Main Source" },
    { key: "sub_source", label: "Sub Source" },
    { key: "sku_code", label: "SKU" },
    { key: "barcode", label: "Barcode" },
    { key: "location", label: "Location" },
    { key: "style_name", label: "Style" },
    { key: "article_no", label: "Article" },
    { key: "brand", label: "Brand" },
    { key: "size", label: "Size" },
    { key: "colour", label: "Colour" },
    { key: "qty_in", label: "Qty In" },
    { key: "qty_out", label: "Qty Out" },
    { key: "current_stock", label: "Available Stock" },
    { key: "added_time", label: "Posted At" },
  ] : [
    { key: "booking_no", label: "Booking ID" },
    { key: "inventory_bucket", label: "Stock Type" },
    { key: "main_source", label: "Main Source" },
    { key: "sub_source", label: "Sub Source" },
    { key: "location", label: "Location" },
    { key: "grn_no", label: "GRN No" },
    { key: "style_name", label: "Style" },
    { key: "order_no", label: "Order No" },
    { key: "work_order_no", label: "Work Order No" },
    { key: "size", label: "Size" },
    { key: "qty_in", label: "Qty In" },
    { key: "qty_out", label: "Qty Out" },
    { key: "current_stock", label: "Current Stock" },
    { key: "added_user", label: "Record Added Email" },
    { key: "added_time", label: "Posted At" },
  ];
  const updateForm = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const gstOptions = masters.gst ?? [];
  const hsnOptions = masters.hsn ?? [];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    if (!form.locationId) {
      setMessage("Select an active Location before saving the stock record.");
      setSaving(false);
      return;
    }
    const response = await fetch("/api/inventory/stock/fg-sku", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, ...form, locationId: form.locationId, qtyIn: Number(form.qtyIn || 0), qtyOut: Number(form.qtyOut || 0) }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save the stock record.");
    } else {
      setForm(emptyForm(posMode ? "DIRECT_FROM_POS" : "DIRECT_FROM_INVENTORY"));
      setLastGeneratedSkuId(posMode
        ? payload.record?.sku_code ?? payload.record?.id ?? ""
        : payload.record?.id ?? "");
      setMessage(posMode
        ? `Stock record added. SKU ${payload.record?.sku_code}; barcode ${payload.record?.barcode}.`
        : "Stock record added.");
      await loadData();
    }
    setSaving(false);
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">{posMode ? "POS Finished Goods Stock" : moduleName}</h1>
      </div>

      <section className="space-y-3">
        {(showForm || addMode) && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div><h2 className="text-lg font-bold text-slate-950">Add Finished Goods SKU Stock</h2><p className="mt-1 text-sm text-slate-500">Current stock is calculated from quantity in and quantity out.</p></div>
            <Button type="button" variant="secondary" size="sm" onClick={() => addMode ? router.push("..") : setShowForm(false)}>Cancel</Button>
          </div>
          <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">{posMode ? "Generated SKU" : "SKU ID"}</span><Input disabled value={posMode ? generatedPosSku || "Enter style, colour, and size" : lastGeneratedSkuId || "Auto generated on save"} className={`${fieldClass} cursor-not-allowed bg-slate-100 text-slate-500`} /></label>
          {posMode
            ? <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Generated Barcode</span><Input disabled value="Assigned automatically on save (POS1, POS2...)" className={`${fieldClass} cursor-not-allowed bg-slate-100 text-slate-500`} /></label>
            : <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Customer Barcode</span><Input className={fieldClass} value={form.barcode} onChange={(event) => updateForm("barcode", event.target.value)} placeholder="Scan or enter customer barcode" /></label>}
          <Select label="Location" value={form.locationId} onChange={(event) => updateForm("locationId", event.target.value)} disabled={locations.length === 0} options={[{ value: "", label: locations.length === 0 ? "No active Locations" : "Select Location" }, ...locations.map((location) => ({ value: location.id, label: location.label }))]} />
          {isDirectSource(form.source) ? <>{posMode ? <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Style Name *</span><Input required className={fieldClass} value={form.styleName} onChange={(event) => updateForm("styleName", event.target.value)} /></label> : <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">General Catalogue Item Name</span><Input disabled value={directItemName(form)} className={`${fieldClass} cursor-not-allowed bg-slate-100 text-slate-500`} /></label>}</> : <><label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Style Name *</span><Input required className={fieldClass} value={form.styleName} onChange={(event) => updateForm("styleName", event.target.value)} /></label><label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Order No *</span><Input required className={fieldClass} value={form.orderNo} onChange={(event) => updateForm("orderNo", event.target.value)} /></label><MasterSelect label="Article No *" value={form.articleNo} options={masters.article ?? []} onChange={(value) => updateForm("articleNo", value)} /></>}
          <MasterSelect label="Brand" value={form.brand} options={masters.brand ?? []} onChange={(value) => updateForm("brand", value)} />
          <MasterSelect label="Size" required={posMode} value={form.size} options={masters.size ?? []} onChange={(value) => updateForm("size", value)} />
          <MasterSelect label="Colour" required={posMode} value={form.colour} options={masters.color ?? []} onChange={(value) => updateForm("colour", value)} />
          <MasterSelect label="Product Category" value={form.productCategory} options={masters.category ?? []} onChange={(value) => updateForm("productCategory", value)} />
          <MasterSelect label="Sub Product Category" value={form.subProductCategory} options={masters["sub-category"] ?? []} onChange={(value) => updateForm("subProductCategory", value)} />
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">GST %</span><Select className={fieldClass} value={form.gstRate} onChange={(event) => updateForm("gstRate", event.target.value)}><option value="">Select GST rate</option>{gstOptions.map((option) => <option key={option.id} value={String(option.fields?.Gst ?? option.fields?.gst ?? option.label)}>{option.label} ({String(option.fields?.Gst ?? option.fields?.gst ?? "-")}%)</option>)}</Select></label>
          <MasterSelect label="HSN Code" value={form.hsnCode} options={hsnOptions} onChange={(value) => updateForm("hsnCode", value)} />
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Purchase Price</span><Input min="0" step="0.01" type="number" className={fieldClass} value={form.purchasePrice} onChange={(event) => updateForm("purchasePrice", event.target.value)} placeholder="0.00" /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Sales Price</span><Input min="0" step="0.01" type="number" className={fieldClass} value={form.salesPrice} onChange={(event) => updateForm("salesPrice", event.target.value)} placeholder="0.00" /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">MRP</span><Input min="0" step="0.01" type="number" className={fieldClass} value={form.mrp} onChange={(event) => updateForm("mrp", event.target.value)} placeholder="0.00" /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Source *</span><Select required className={fieldClass} value={form.source} onChange={(event) => updateForm("source", event.target.value)}>{(posMode ? posSourceOptions : inventorySourceOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Qty In</span><Input min="0" step="0.01" type="number" className={fieldClass} value={form.qtyIn} onChange={(event) => updateForm("qtyIn", event.target.value)} /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Qty Out</span><Input min="0" step="0.01" type="number" className={fieldClass} value={form.qtyOut} onChange={(event) => updateForm("qtyOut", event.target.value)} /></label>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><span className="block text-xs font-semibold text-emerald-800">Current Stock</span><strong className="text-lg text-emerald-950">{currentStock.toFixed(2)}</strong></div>
          <div className="flex items-end"><Button disabled={saving} className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"type="submit" >{saving ? "Adding..." : "Add Record"}</Button></div>
          {message && <p className="sm:col-span-2 lg:col-span-4 text-sm font-medium text-slate-600">{message}</p>}
          </form>
        </div>}

        {!addMode && <ReportGrid
          title={posMode ? "POS Finished Goods Stock" : allocatedOnly ? "Allocated Finished Goods Stock" : moduleName === "General Stock" ? "Finished Goods General Stock" : "Finished Goods SKU Stock"}
          records={sortedRecords}
          fields={reportFields}
          visibleFields={visibleFields.length > 0 ? visibleFields : reportFields.map(({ key }) => key)}
          onVisibleFieldsChange={(fields) => setVisibleFields(fields.map(String))}
          rowIdSelector={(record) => record.id}
          selectedIds={[]}
          onRowClick={(recordId) => {
            const record = sortedRecords.find((candidate) => candidate.id === recordId);
            if (!record) return;
            const returnTo = encodeURIComponent(pathname);
            if (!record.inventory_bucket) {
              router.push(`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/inventory-management/stock/fg-stock/sku/${encodeURIComponent(recordId)}?returnTo=${returnTo}`);
              return;
            }
            const recordType = record.inventory_bucket === "GENERAL" ? "general" : "allocated";
            router.push(`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/inventory-management/stock/fg-stock/record/${recordType}/${encodeURIComponent(recordId)}?returnTo=${returnTo}`);
          }}
          onNewOrder={() => router.push(`${pathname}/add`)}
          newActionLabel="+ Add Record"
          renderCell={(fieldKey, record) => fieldKey === "location"
            ? record.location.location_name
            : fieldKey === "added_time"
              ? new Date(record.added_time).toLocaleString()
              : fieldKey === "main_source"
                ? <Badge>{record.main_source}</Badge>
                : fieldKey === "sub_source"
                  ? record.sub_source
                : fieldKey === "source"
                  ? sourceLabels[record.source] ?? record.source.replaceAll("_", " ")
                : fieldKey === "inventory_bucket"
                  ? <Badge>{record.inventory_bucket ? record.inventory_bucket.replaceAll("_", " ") : record.source === "DIRECT" ? "GENERAL" : "ALLOCATED"}</Badge>
                : fieldKey === "booking_no"
                  ? record.booking_no ? <Badge>{record.booking_no}</Badge> : "-"
                : String(record[fieldKey as keyof StockRecord] ?? "-")}
          emptyMessage={loading ? "Loading stock records..." : posMode ? "No POS-related finished goods stock records yet." : allocatedOnly ? "No order-linked finished goods stock records yet." : "No finished goods SKU stock records yet."}
        />}
      </section>
    </main>
  );
}
