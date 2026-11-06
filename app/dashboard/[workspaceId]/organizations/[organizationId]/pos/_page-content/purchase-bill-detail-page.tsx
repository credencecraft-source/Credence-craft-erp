"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCode } from "lucide-react";

import PurchaseBillQrRequestModal from "./purchase-bill-qr-request-modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";


type BillLine = {
  id: string;
  itemName: string | null;
  size: string | null;
  quantity: string;
  purchasePrice: string | null;
  gstRate: string | null;
  hsnCode: string | null;
  taxAmount: string;
  total: string;
  sourceRecord: { recordNumber: string; itemType: string; styleName: string | null; brandId: string | null; sizeGroupId: string | null; colorId: string | null; categoryId: string | null; subCategoryId: string | null } | null;
  stock: { id: string; sku_code: string | null } | null;
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
export default function PurchaseBillDetailPage({ workspaceId, organizationId, billId }: { workspaceId: string; organizationId: string; billId: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showQrRequest, setShowQrRequest] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/${encodeURIComponent(billId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load purchase bill.");
    setBill(data.bill);
  }, [billId, organizationId]);
  const closeQrRequest = useCallback(() => setShowQrRequest(false), []);
  const submitQrRequest = useCallback((successMessage: string) => {
    setShowQrRequest(false);
    setError("");
    setMessage(successMessage);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load()
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load purchase bill."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

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
      <header className="erp-page-header items-start"><div><p className="erp-eyebrow">POS Purchase Bill</p><h1 className="erp-page-heading mt-0.5">{bill.documentNumber}</h1><p className="mt-0.5 text-xs text-slate-500">Supplier bill {bill.billNumber} · {date(bill.billDate)} · {bill.status}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => setShowQrRequest(true)} disabled={!bill.lines.length}><QrCode className="h-4 w-4" aria-hidden="true" /> Request item barcodes</Button><Button type="button" onClick={createStock} disabled={working || bill.lines.every((line) => Boolean(line.stock))} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">{working ? "Creating stock..." : bill.lines.every((line) => Boolean(line.stock)) ? "Stock Created" : "Approve & Create Stock"}</Button></div></header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Vendor</p><p className="mt-2 font-bold text-slate-950">{bill.vendor.vendor}</p><p className="mt-1 text-xs text-slate-500">GSTIN {bill.vendor.gst_number || "-"}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Bill Date</p><p className="mt-2 font-bold text-slate-950">{date(bill.billDate)}</p><p className="mt-1 text-xs text-slate-500">Tax mode {bill.taxMode}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Quantity</p><p className="mt-2 font-bold text-slate-950">{bill.totalQuantity}</p><p className="mt-1 text-xs text-slate-500">{bill.lines.length} item lines</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Taxable Amount</p><p className="mt-2 font-bold text-slate-950">{money(bill.subtotal)}</p></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-bold uppercase text-emerald-700">Bill Total</p><p className="mt-2 text-lg font-bold text-emerald-900">{money(bill.total)}</p><p className="mt-1 text-xs text-emerald-700">GST {money(bill.tax)}</p></div></section>
      <div className="space-y-4">{groupedRecords.map((group) => <section key={group.recordNumber} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Purchase Bill Item Group</p><h2 className="mt-1 font-bold text-slate-950">{group.recordNumber} · {group.styleName}</h2></div><span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700">{group.itemType.replaceAll("_", " ")}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Size</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Purchase Price</th><th className="px-4 py-3 text-right">GST</th><th className="px-4 py-3">HSN</th><th className="px-4 py-3">Stock</th></tr></thead><tbody className="divide-y divide-slate-100">{group.lines.map((line) => <tr key={line.id}><td className="px-4 py-3 font-semibold text-slate-950">{line.itemName || group.styleName}</td><td className="px-4 py-3 text-slate-700">{line.size || "-"}</td><td className="px-4 py-3 text-right font-bold">{line.quantity}</td><td className="px-4 py-3 text-right">{money(line.purchasePrice)}</td><td className="px-4 py-3 text-right">{line.gstRate || "0"}%</td><td className="px-4 py-3">{line.hsnCode || "-"}</td><td className="px-4 py-3">{line.stock ? <span className="font-semibold text-emerald-700">Created · {line.stock.sku_code || line.stock.id}</span> : <span className="text-amber-700">Pending</span>}</td></tr>)}</tbody></table></div></section>)}</div>
    </> : null}
    {bill && showQrRequest && (
      <PurchaseBillQrRequestModal
        open
        workspaceId={workspaceId}
        organizationId={organizationId}
        bill={bill}
        onClose={closeQrRequest}
        onSubmitted={submitQrRequest}
      />
    )}
  </Section></Page>;
}
