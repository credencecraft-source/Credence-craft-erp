"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ReportGrid } from "@/components/reports/report-grid-display";

type MasterValue = { id: string; label: string; fields?: Record<string, unknown> };
type StockRecord = {
  id: string;
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
  qty_in: string | number;
  qty_out: string | number;
  current_stock: string | number;
  gst_rate: string | number | null;
  hsn_code: string | null;
  purchase_price: string | number | null;
  sales_price: string | number | null;
  mrp: string | number | null;
};

type FormState = {
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

const emptyForm: FormState = {
  styleName: "", orderNo: "", articleNo: "", brand: "", size: "", colour: "",
  productCategory: "", subProductCategory: "", source: "DIRECT", qtyIn: "", qtyOut: "",
  gstRate: "", hsnCode: "", purchasePrice: "", salesPrice: "", mrp: "", barcode: "",
};

const sourceOptions = [
  ["DIRECT", "Direct"],
  ["PACKING_LIST_GRN", "Packing List GRN"],
  ["WO_ORDER_GRN", "WO Order GRN"],
] as const;

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function directItemName(form: FormState) {
  return [form.productCategory, form.subProductCategory, form.brand, form.size, form.colour].filter(Boolean).join(" - ") || "Generated from catalogue selections";
}

function MasterSelect({ label, value, options, onChange }: { label: string; value: string; options: MasterValue[]; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {label}</option>
        {options.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
      </select>
    </label>
  );
}

export default function FgStockModulePage({ moduleName, addMode = false }: { moduleName: string; addMode?: boolean }) {
  const { organizationId } = useParams<{ organizationId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [masters, setMasters] = useState<Record<string, MasterValue[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lastGeneratedSkuId, setLastGeneratedSkuId] = useState("");
  const [showForm, setShowForm] = useState(addMode);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);

  const currentStock = Math.max(0, Number(form.qtyIn || 0) - Number(form.qtyOut || 0));
  const loadData = async () => {
    setLoading(true);
    const [stockResponse, masterResponse] = await Promise.all([
      fetch(`/api/inventory/stock/fg-sku?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" }),
      fetch(`/api/masters?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" }),
    ]);
    const stockPayload = await stockResponse.json();
    const masterPayload = await masterResponse.json();
    setRecords(stockPayload.records ?? []);
    setMasters(Object.fromEntries((masterPayload.masters ?? []).map((master: { module_key: string; values: MasterValue[] }) => [master.module_key, master.values])));
    setLoading(false);
  };

  useEffect(() => { void loadData(); }, [organizationId]);

  const sortedRecords = useMemo(() => records, [records]);
  const updateForm = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const gstOptions = masters.gst ?? [];
  const hsnOptions = masters.hsn ?? [];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/inventory/stock/fg-sku", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, ...form, qtyIn: Number(form.qtyIn || 0), qtyOut: Number(form.qtyOut || 0) }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save the stock record.");
    } else {
      setForm(emptyForm);
      setLastGeneratedSkuId(payload.record?.id ?? "");
      setMessage("Stock record added.");
      await loadData();
    }
    setSaving(false);
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-5">
      <Link href=".." className="text-xs font-semibold text-emerald-700 hover:underline">&larr; FG Stock</Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Finished Goods Stock</p>
        <h1 className="text-2xl font-bold text-slate-950">{moduleName}</h1>
      </div>

      <section className="space-y-3">
        {(showForm || addMode) && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div><h2 className="text-lg font-bold text-slate-950">Add Finished Goods SKU Stock</h2><p className="mt-1 text-sm text-slate-500">Current stock is calculated from quantity in and quantity out.</p></div>
            <button type="button" onClick={() => addMode ? router.push("..") : setShowForm(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">Cancel</button>
          </div>
          <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">SKU ID</span><input disabled value={lastGeneratedSkuId || "Auto generated on save"} className={`${fieldClass} cursor-not-allowed bg-slate-100 text-slate-500`} /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Customer Barcode</span><input className={fieldClass} value={form.barcode} onChange={(event) => updateForm("barcode", event.target.value)} placeholder="Scan or enter customer barcode" /></label>
          {form.source === "DIRECT" ? <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">General Catalogue Item Name</span><input disabled value={directItemName(form)} className={`${fieldClass} cursor-not-allowed bg-slate-100 text-slate-500`} /></label> : <><label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Style Name *</span><input required className={fieldClass} value={form.styleName} onChange={(event) => updateForm("styleName", event.target.value)} /></label><label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Order No *</span><input required className={fieldClass} value={form.orderNo} onChange={(event) => updateForm("orderNo", event.target.value)} /></label><MasterSelect label="Article No *" value={form.articleNo} options={masters.article ?? []} onChange={(value) => updateForm("articleNo", value)} /></>}
          <MasterSelect label="Brand" value={form.brand} options={masters.brand ?? []} onChange={(value) => updateForm("brand", value)} />
          <MasterSelect label="Size" value={form.size} options={masters.size ?? []} onChange={(value) => updateForm("size", value)} />
          <MasterSelect label="Colour" value={form.colour} options={masters.color ?? []} onChange={(value) => updateForm("colour", value)} />
          <MasterSelect label="Product Category" value={form.productCategory} options={masters.category ?? []} onChange={(value) => updateForm("productCategory", value)} />
          <MasterSelect label="Sub Product Category" value={form.subProductCategory} options={masters["sub-category"] ?? []} onChange={(value) => updateForm("subProductCategory", value)} />
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">GST %</span><select className={fieldClass} value={form.gstRate} onChange={(event) => updateForm("gstRate", event.target.value)}><option value="">Select GST rate</option>{gstOptions.map((option) => <option key={option.id} value={String(option.fields?.Gst ?? option.fields?.gst ?? option.label)}>{option.label} ({String(option.fields?.Gst ?? option.fields?.gst ?? "-")}%)</option>)}</select></label>
          <MasterSelect label="HSN Code" value={form.hsnCode} options={hsnOptions} onChange={(value) => updateForm("hsnCode", value)} />
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Purchase Price</span><input min="0" step="0.01" type="number" className={fieldClass} value={form.purchasePrice} onChange={(event) => updateForm("purchasePrice", event.target.value)} placeholder="0.00" /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Sales Price</span><input min="0" step="0.01" type="number" className={fieldClass} value={form.salesPrice} onChange={(event) => updateForm("salesPrice", event.target.value)} placeholder="0.00" /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">MRP</span><input min="0" step="0.01" type="number" className={fieldClass} value={form.mrp} onChange={(event) => updateForm("mrp", event.target.value)} placeholder="0.00" /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Source *</span><select required className={fieldClass} value={form.source} onChange={(event) => updateForm("source", event.target.value)}>{sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Qty In</span><input min="0" step="0.01" type="number" className={fieldClass} value={form.qtyIn} onChange={(event) => updateForm("qtyIn", event.target.value)} /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Qty Out</span><input min="0" step="0.01" type="number" className={fieldClass} value={form.qtyOut} onChange={(event) => updateForm("qtyOut", event.target.value)} /></label>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><span className="block text-xs font-semibold text-emerald-800">Current Stock</span><strong className="text-lg text-emerald-950">{currentStock.toFixed(2)}</strong></div>
          <div className="flex items-end"><button disabled={saving} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Adding..." : "Add Record"}</button></div>
          {message && <p className="sm:col-span-2 lg:col-span-4 text-sm font-medium text-slate-600">{message}</p>}
          </form>
        </div>}

        {!addMode && <ReportGrid
          title="Finished Goods SKU Stock"
          records={sortedRecords}
          fields={[
            { key: "sku_code", label: "SKU Code" }, { key: "barcode", label: "Customer Barcode" }, { key: "id", label: "Record ID / Barcode" }, { key: "style_name", label: "Style Name" }, { key: "order_no", label: "Order No" }, { key: "article_no", label: "Article No" },
            { key: "brand", label: "Brand" }, { key: "size", label: "Size" }, { key: "colour", label: "Colour" }, { key: "product_category", label: "Product Category" },
            { key: "sub_product_category", label: "Sub Product Category" }, { key: "gst_rate", label: "GST %" }, { key: "hsn_code", label: "HSN Code" }, { key: "purchase_price", label: "Purchase Price" }, { key: "sales_price", label: "Sales Price" }, { key: "mrp", label: "MRP" }, { key: "added_time", label: "Added Time" }, { key: "added_user", label: "Added User" },
            { key: "source", label: "Source" }, { key: "qty_in", label: "Qty In" }, { key: "qty_out", label: "Qty Out" }, { key: "current_stock", label: "Current Stock" },
          ]}
          visibleFields={visibleFields.length > 0 ? visibleFields : ["sku_code", "barcode", "id", "style_name", "order_no", "article_no", "brand", "size", "colour", "product_category", "sub_product_category", "gst_rate", "hsn_code", "purchase_price", "sales_price", "mrp", "added_time", "added_user", "source", "qty_in", "qty_out", "current_stock"]}
          onVisibleFieldsChange={(fields) => setVisibleFields(fields.map(String))}
          rowIdSelector={(record) => record.id}
          selectedIds={[]}
          onRowClick={(recordId) => router.push(`${pathname}/${encodeURIComponent(recordId)}`)}
          onNewOrder={() => router.push(`${pathname}/add`)}
          newActionLabel="+ Add Record"
          renderCell={(fieldKey, record) => fieldKey === "added_time" ? new Date(record.added_time).toLocaleString() : fieldKey === "source" ? record.source.replaceAll("_", " ") : String(record[fieldKey as keyof StockRecord] ?? "-")}
          emptyMessage={loading ? "Loading stock records..." : "No finished goods SKU stock records yet."}
        />}
      </section>
    </main>
  );
}
