"use client";

import JsBarcode from "jsbarcode";
import { Barcode, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type BillLine = {
  id: string;
  itemName: string | null;
  size: string | null;
  quantity: string;
  purchasePrice: string | null;
  salesPrice: string | null;
  gstRate: string | null;
  hsnCode: string | null;
  taxAmount: string;
  total: string;
  sourceRecord: { recordNumber: string; itemType: string; styleName: string | null; brandId: string | null; sizeGroupId: string | null; colorId: string | null; categoryId: string | null; subCategoryId: string | null } | null;
  stock: { id: string; sku_code: string | null; barcode?: string | null } | null;
};

type Bill = {
  id: string;
  documentNumber: string;
  billNumber: string;
  billDate: string;
  taxMode: string;
  status: string;
  totalQuantity: string;
  subtotal: string;
  tax: string;
  total: string;
  createdAt: string;
  postedAt: string | null;
  vendor: { id: string; vendor: string; gst_number: string | null; registered_state: string | null };
  lines: BillLine[];
};

const money = (value: string | number | null | undefined) => `Rs ${Number(value ?? 0).toFixed(2)}`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString() : "-";
const printPresets = {
  a4: { label: "A4 sheet", width: "48", height: "30", columns: "3", gap: "4" },
  thermal58: { label: "58 mm thermal", width: "48", height: "30", columns: "1", gap: "2" },
  thermal80: { label: "80 mm thermal", width: "70", height: "40", columns: "1", gap: "2" },
} as const;
type PrintPreset = keyof typeof printPresets;
type BarcodeFormat = "CODE128" | "EAN13" | "UPC";
type PrintConfig = { preset: PrintPreset; width: string; height: string; columns: string; gap: string; format: BarcodeFormat; showDetails: boolean };

function PrintableBarcode({ value, format }: { value: string; format: BarcodeFormat }) {
  const barcodeRef = (node: SVGSVGElement | null) => {
    if (!node) return;
    try {
      JsBarcode(node, value, { format, displayValue: true, fontSize: 10, margin: 0, height: 34, width: 1.2 });
    } catch {
      JsBarcode(node, value.replace(/[^0-9]/g, "").slice(0, 12) || "0", { format: "CODE128", displayValue: true, fontSize: 10, margin: 0, height: 34, width: 1.2 });
    }
  };
  return <svg ref={barcodeRef} className="h-auto max-w-full" />;
}

function BarcodePrintPanel({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const storageKey = `purchase-bill-barcode-print:${bill.vendor.id}`;
  const [config, setConfig] = useState<PrintConfig>(() => {
    if (typeof window === "undefined") return { preset: "a4", ...printPresets.a4, format: "CODE128", showDetails: true };
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null") as Partial<PrintConfig> | null;
      return saved ? { preset: "a4", ...printPresets.a4, format: "CODE128", showDetails: true, ...saved } : { preset: "a4", ...printPresets.a4, format: "CODE128", showDetails: true };
    } catch {
      return { preset: "a4", ...printPresets.a4, format: "CODE128", showDetails: true };
    }
  });
  useEffect(() => { window.localStorage.setItem(storageKey, JSON.stringify(config)); }, [config, storageKey]);
  const labels = useMemo(() => bill.lines.flatMap((line) => {
    const quantity = Math.min(500, Math.max(0, Math.floor(Number(line.quantity) || 0)));
    const value = line.stock?.barcode || line.stock?.sku_code || line.stock?.id || line.itemName || line.id;
    return Array.from({ length: quantity }, (_, index) => ({ line, value, copy: index + 1 }));
  }), [bill.lines]);
  const setPreset = (preset: PrintPreset) => setConfig((current) => ({ ...current, preset, ...printPresets[preset] }));
  const update = (key: keyof PrintConfig, value: string | boolean) => setConfig((current) => ({ ...current, [key]: value, ...(key === "preset" ? printPresets[value as PrintPreset] : {}) }));
  const labelStyle = { width: `${Math.max(20, Number(config.width) || 48)}mm`, minHeight: `${Math.max(15, Number(config.height) || 30)}mm` };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 print:static print:overflow-visible print:bg-white print:p-0">
    <style>{`@media print { @page { size: ${Math.max(20, Number(config.width) || 48)}mm auto; margin: 5mm; } .barcode-print-grid { grid-template-columns: repeat(var(--barcode-columns), minmax(0, 1fr)); gap: var(--barcode-gap); } .barcode-print-label { break-inside: avoid; } }`}</style>
    <div className="mx-auto max-w-6xl rounded-xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 print:hidden"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Barcode labels</p><h2 className="mt-1 text-xl font-bold text-slate-950">{bill.documentNumber} · {labels.length} labels</h2><p className="mt-1 text-xs text-slate-500">Each label is generated from the item quantity.</p></div><div className="flex gap-2"><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"><Printer className="h-4 w-4" /> Print labels</button><button type="button" onClick={onClose} aria-label="Close barcode print panel" className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" /></button></div></div>
      <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-5 print:hidden sm:grid-cols-2 lg:grid-cols-6"><label className="space-y-1 text-xs font-semibold text-slate-700 lg:col-span-2">Printer preset<select value={config.preset} onChange={(event) => setPreset(event.target.value as PrintPreset)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">{Object.entries(printPresets).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select></label><label className="space-y-1 text-xs font-semibold text-slate-700">Barcode format<select value={config.format} onChange={(event) => update("format", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"><option value="CODE128">Code 128</option><option value="EAN13">EAN-13</option><option value="UPC">UPC</option></select></label><label className="space-y-1 text-xs font-semibold text-slate-700">Width (mm)<input type="number" min="20" max="200" value={config.width} onChange={(event) => update("width", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-700">Height (mm)<input type="number" min="15" max="100" value={config.height} onChange={(event) => update("height", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-700">Columns<input type="number" min="1" max="8" value={config.columns} onChange={(event) => update("columns", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label><label className="flex items-center gap-2 text-xs font-semibold text-slate-700 lg:col-span-2"><input type="checkbox" checked={config.showDetails} onChange={(event) => update("showDetails", event.target.checked)} className="h-4 w-4 accent-emerald-700" /> Show item, size, and price</label></div>
      <div className="barcode-print-grid grid content-start p-5" style={{ "--barcode-columns": Math.min(8, Math.max(1, Number(config.columns) || 1)), "--barcode-gap": `${Math.max(0, Number(config.gap) || 0)}mm` } as React.CSSProperties}>{labels.map(({ line, value, copy }) => <article key={`${line.id}-${copy}`} className="barcode-print-label flex flex-col items-center justify-center overflow-hidden border border-slate-300 bg-white p-2 text-center" style={labelStyle}><p className="w-full truncate text-[10px] font-bold text-slate-900">{line.itemName || line.sourceRecord?.styleName || "Item"}</p>{config.showDetails && <p className="w-full truncate text-[9px] text-slate-600">Size {line.size || "-"} · {money(line.salesPrice || line.purchasePrice)}</p>}<PrintableBarcode value={value} format={config.format} /><p className="text-[8px] text-slate-500">{value}</p></article>)}</div>
    </div>
  </div>;
}

export default function PurchaseBillDetailPage({ organizationId, billId }: { workspaceId: string; organizationId: string; billId: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showBarcodePrint, setShowBarcodePrint] = useState(false);

  const load = async () => {
    const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/${encodeURIComponent(billId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load purchase bill.");
    setBill(data.bill);
  };

  useEffect(() => { load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load purchase bill.")).finally(() => setLoading(false)); }, [billId, organizationId]);

  const groupedRecords = useMemo(() => {
    if (!bill) return [];
    const groups = new Map<string, { recordNumber: string; styleName: string; itemType: string; lines: BillLine[] }>();
    for (const line of bill.lines) {
      const record = line.sourceRecord;
      const key = record?.recordNumber ?? line.id;
      const existing = groups.get(key);
      if (existing) existing.lines.push(line);
      else groups.set(key, { recordNumber: record?.recordNumber ?? "Unassigned", styleName: record?.styleName ?? line.itemName ?? "-", itemType: record?.itemType ?? "-", lines: [line] });
    }
    return [...groups.values()];
  }, [bill]);

  const createStock = async () => {
    if (!bill || !window.confirm(`Approve ${bill.documentNumber} and create Finished Goods stock?`)) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/${encodeURIComponent(billId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-stock" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create Finished Goods stock.");
      setBill(data.bill); setMessage("Approved and created Finished Goods stock from this POS purchase bill.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to create Finished Goods stock.");
    } finally { setWorking(false); }
  };

  return <Page as="div"><Section className="space-y-5">
    {loading ? <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading purchase bill details...</div> : error && !bill ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : bill ? <>
      <header className="erp-page-header items-start"><div><p className="erp-eyebrow">POS Purchase Bill</p><h1 className="erp-page-heading mt-0.5">{bill.documentNumber}</h1><p className="mt-0.5 text-xs text-slate-500">Supplier bill {bill.billNumber} · {date(bill.billDate)} · {bill.status}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowBarcodePrint(true)} disabled={!bill.lines.some((line) => Number(line.quantity) > 0)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Barcode className="h-4 w-4" /> Print barcodes</button><button type="button" onClick={createStock} disabled={working || bill.lines.every((line) => Boolean(line.stock))} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">{working ? "Creating stock..." : bill.lines.every((line) => Boolean(line.stock)) ? "Stock Created" : "Approve & Create Stock"}</button></div></header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Vendor</p><p className="mt-2 font-bold text-slate-950">{bill.vendor.vendor}</p><p className="mt-1 text-xs text-slate-500">GSTIN {bill.vendor.gst_number || "-"}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Bill Date</p><p className="mt-2 font-bold text-slate-950">{date(bill.billDate)}</p><p className="mt-1 text-xs text-slate-500">Tax mode {bill.taxMode}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Quantity</p><p className="mt-2 font-bold text-slate-950">{bill.totalQuantity}</p><p className="mt-1 text-xs text-slate-500">{bill.lines.length} item lines</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Taxable Amount</p><p className="mt-2 font-bold text-slate-950">{money(bill.subtotal)}</p></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-bold uppercase text-emerald-700">Bill Total</p><p className="mt-2 text-lg font-bold text-emerald-900">{money(bill.total)}</p><p className="mt-1 text-xs text-emerald-700">GST {money(bill.tax)}</p></div></section>
      <div className="space-y-4">{groupedRecords.map((group) => <section key={group.recordNumber} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Purchase Bill Item Group</p><h2 className="mt-1 font-bold text-slate-950">{group.recordNumber} · {group.styleName}</h2></div><span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700">{group.itemType.replaceAll("_", " ")}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Size</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Purchase Price</th><th className="px-4 py-3 text-right">GST</th><th className="px-4 py-3">HSN</th><th className="px-4 py-3">Stock</th></tr></thead><tbody className="divide-y divide-slate-100">{group.lines.map((line) => <tr key={line.id}><td className="px-4 py-3 font-semibold text-slate-950">{line.itemName || group.styleName}</td><td className="px-4 py-3 text-slate-700">{line.size || "-"}</td><td className="px-4 py-3 text-right font-bold">{line.quantity}</td><td className="px-4 py-3 text-right">{money(line.purchasePrice)}</td><td className="px-4 py-3 text-right">{line.gstRate || "0"}%</td><td className="px-4 py-3">{line.hsnCode || "-"}</td><td className="px-4 py-3">{line.stock ? <span className="font-semibold text-emerald-700">Created · {line.stock.sku_code || line.stock.id}</span> : <span className="text-amber-700">Pending</span>}</td></tr>)}</tbody></table></div></section>)}</div>
    </> : null}
    {bill && showBarcodePrint && <BarcodePrintPanel bill={bill} onClose={() => setShowBarcodePrint(false)} />}
  </Section></Page>;
}
