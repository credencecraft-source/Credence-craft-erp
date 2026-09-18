"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type Option = { id: string; label: string; fields?: Record<string, unknown> };
type StockRecord = { id: string; sku_code: string | null; barcode: string | null; style_name: string; order_no: string; article_no: string; brand: string | null; size: string | null; colour: string | null; product_category: string | null; sub_product_category: string | null; gst_rate: string | number | null; hsn_code: string | null; purchase_price: string | number | null; sales_price: string | number | null; mrp: string | number | null; source: string; qty_in: string | number; qty_out: string | number; current_stock: string | number };
type FormState = { styleName: string; orderNo: string; articleNo: string; barcode: string; brand: string; size: string; colour: string; productCategory: string; subProductCategory: string; gstRate: string; hsnCode: string; purchasePrice: string; salesPrice: string; mrp: string; source: string; qtyIn: string; qtyOut: string };

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const sources = [["DIRECT", "Direct"], ["PACKING_LIST_GRN", "Packing List GRN"], ["WO_ORDER_GRN", "WO Order GRN"]] as const;

function toForm(record: StockRecord): FormState {
  return { styleName: record.style_name, orderNo: record.order_no, articleNo: record.article_no, barcode: record.barcode ?? "", brand: record.brand ?? "", size: record.size ?? "", colour: record.colour ?? "", productCategory: record.product_category ?? "", subProductCategory: record.sub_product_category ?? "", gstRate: record.gst_rate == null ? "" : String(record.gst_rate), hsnCode: record.hsn_code ?? "", purchasePrice: record.purchase_price == null ? "" : String(record.purchase_price), salesPrice: record.sales_price == null ? "" : String(record.sales_price), mrp: record.mrp == null ? "" : String(record.mrp), source: record.source, qtyIn: String(record.qty_in), qtyOut: String(record.qty_out) };
}

export default function FgSkuDetailPage({ workspaceId, organizationId, skuId }: { workspaceId: string; organizationId: string; skuId: string }) {
  const [record, setRecord] = useState<StockRecord | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [gstOptions, setGstOptions] = useState<Option[]>([]);
  const [hsnOptions, setHsnOptions] = useState<Option[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/stock/fg-stock/sku`;

  useEffect(() => {
    Promise.all([
      fetch(`/api/inventory/stock/fg-sku?organizationId=${encodeURIComponent(organizationId)}&barcode=${encodeURIComponent(skuId)}`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/hsn?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
    ]).then(([stockData, gstData, hsnData]) => {
      if (!stockData.record) throw new Error(stockData.error || "Unable to load SKU.");
      setRecord(stockData.record); setForm(toForm(stockData.record)); setGstOptions(Array.isArray(gstData) ? gstData : []); setHsnOptions(Array.isArray(hsnData) ? hsnData : []);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load SKU."));
  }, [organizationId, skuId]);

  const update = (key: keyof FormState, value: string) => setForm((current) => current ? { ...current, [key]: value } : current);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!form || !record) return;
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/inventory/stock/fg-sku", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, recordId: record.id, ...form, qtyIn: Number(form.qtyIn || 0), qtyOut: Number(form.qtyOut || 0) }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Unable to save SKU."); else { setRecord(data.record); setForm(toForm(data.record)); setMessage("SKU stock record updated."); }
    setSaving(false);
  };

  const textFields: Array<[keyof FormState, string]> = [["brand", "Brand"], ["size", "Size"], ["colour", "Colour"], ["productCategory", "Product Category"], ["subProductCategory", "Sub Product Category"]];
  const numberFields: Array<[keyof FormState, string]> = [["purchasePrice", "Purchase Price"], ["salesPrice", "Sales Price"], ["mrp", "MRP"], ["qtyIn", "Qty In"], ["qtyOut", "Qty Out"]];

  return <Page as="div"><Section className="space-y-5"><Link href={base} className="text-xs font-semibold text-emerald-700">&larr; Finished Goods SKU Stock</Link>{error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}{!form || !record ? <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading SKU...</div> : <><header className="border-b border-slate-200 pb-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Edit Finished Goods Stock</p><h1 className="mt-2 text-3xl font-bold text-slate-950">{record.sku_code || record.id}</h1><p className="mt-1 text-sm text-slate-500">Edit the same fields available when creating a stock record.</p></header><form onSubmit={save} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4"><label className="space-y-1"><span className="text-xs font-semibold text-slate-700">SKU Code</span><input disabled value={record.sku_code || "-"} className={`${fieldClass} cursor-not-allowed bg-slate-100`} /></label><label className="space-y-1"><span className="text-xs font-semibold text-slate-700">Customer Barcode</span><input value={form.barcode} onChange={(event) => update("barcode", event.target.value)} className={fieldClass} /></label><label className="space-y-1"><span className="text-xs font-semibold text-slate-700">Style Name *</span><input required value={form.styleName} onChange={(event) => update("styleName", event.target.value)} className={fieldClass} /></label><label className="space-y-1"><span className="text-xs font-semibold text-slate-700">Order No *</span><input required value={form.orderNo} onChange={(event) => update("orderNo", event.target.value)} className={fieldClass} /></label><label className="space-y-1"><span className="text-xs font-semibold text-slate-700">Article No *</span><input required value={form.articleNo} onChange={(event) => update("articleNo", event.target.value)} className={fieldClass} /></label>{textFields.map(([key, label]) => <label key={key} className="space-y-1"><span className="text-xs font-semibold text-slate-700">{label}</span><input value={form[key]} onChange={(event) => update(key, event.target.value)} className={fieldClass} /></label>)}<label className="space-y-1"><span className="text-xs font-semibold text-slate-700">GST %</span><select value={form.gstRate} onChange={(event) => update("gstRate", event.target.value)} className={fieldClass}><option value="">Select GST</option>{gstOptions.map((option) => <option key={option.id} value={String(option.fields?.Gst ?? option.fields?.gst ?? option.label)}>{option.label} ({String(option.fields?.Gst ?? option.fields?.gst ?? "-")}%)</option>)}</select></label><label className="space-y-1"><span className="text-xs font-semibold text-slate-700">HSN Code</span><select value={form.hsnCode} onChange={(event) => update("hsnCode", event.target.value)} className={fieldClass}><option value="">Select HSN</option>{hsnOptions.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select></label>{numberFields.map(([key, label]) => <label key={key} className="space-y-1"><span className="text-xs font-semibold text-slate-700">{label}</span><input type="number" min="0" step="0.01" value={form[key]} onChange={(event) => update(key, event.target.value)} className={fieldClass} /></label>)}<label className="space-y-1"><span className="text-xs font-semibold text-slate-700">Source</span><select value={form.source} onChange={(event) => update("source", event.target.value)} className={fieldClass}>{sources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="flex items-end"><button disabled={saving} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{saving ? "Saving..." : "Save Changes"}</button></div>{message && <p className="sm:col-span-2 lg:col-span-4 text-sm font-medium text-emerald-700">{message}</p>}</form></>}</Section></Page>;
}
