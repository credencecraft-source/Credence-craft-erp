"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type SavedInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  lines: Array<{ record: { id: string; style_name: string; order_no: string; article_no: string; size: string | null; colour: string | null; hsn_code?: string | null }; quantity: number; rate: number; gstRate?: number; amount: number }>;
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  savedAt: string;
};

const reportFields: Array<{ key: keyof SavedInvoice; label: string }> = [
  { key: "invoiceNumber", label: "Invoice No." },
  { key: "invoiceDate", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "subtotal", label: "Total" },
];

export default function PosInvoicePage({ workspaceId, organizationId }: { workspaceId: string; organizationId: string }) {
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [selected, setSelected] = useState<SavedInvoice | null>(null);
  const [visibleReportFields, setVisibleReportFields] = useState<Array<string | keyof SavedInvoice>>(
    reportFields.map((field) => field.key),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(`pos-sales-invoices-${organizationId}`);
      if (stored) setInvoices(JSON.parse(stored) as SavedInvoice[]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [organizationId]);

  const renderCell = (fieldKey: string, record: SavedInvoice) => {
    switch (fieldKey) {
      case "customer":
        return record.customer || "Walk-in customer";
      case "quantity":
        return record.lines.reduce((total, line) => total + line.quantity, 0);
      case "subtotal":
        return <span className="font-semibold text-slate-900">Rs {record.subtotal.toFixed(2)}</span>;
      default:
        return String(record[fieldKey as keyof SavedInvoice] ?? "");
    }
  };

  return <Page as="div"><Section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4"><div><p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">POS Invoice</p><h1 className="mt-2 text-3xl font-bold text-slate-900">Saved Invoices</h1><p className="mt-2 text-sm text-slate-600">Review and print sales invoices saved from Quick Invoice.</p></div></div>
    {selected ? <InvoicePreview invoice={selected} onBack={() => setSelected(null)} /> : <ReportGrid title="Saved POS Invoices" records={invoices} fields={reportFields} visibleFields={visibleReportFields} onVisibleFieldsChange={setVisibleReportFields} rowIdSelector={(record) => record.invoiceNumber} selectedIds={[]} onRowClick={(recordId) => { const match = invoices.find((invoice) => invoice.invoiceNumber === recordId); if (match) setSelected(match); }} renderCell={renderCell} emptyMessage="No saved POS invoices yet." />}
  </Section></Page>;
}

function InvoicePreview({ invoice, onBack }: { invoice: SavedInvoice; onBack: () => void }) {
  const taxRate = invoice.taxRate ?? 0;
  const taxAmount = invoice.taxAmount ?? invoice.subtotal * taxRate / 100;
  const grandTotal = invoice.grandTotal ?? invoice.subtotal + taxAmount;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <button type="button" onClick={onBack} className="text-xs font-semibold text-emerald-700">&larr; Invoice report</button>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          <Printer className="h-4 w-4" /> Print Tax Invoice
        </button>
      </div>

      <article className="overflow-hidden border border-slate-300 bg-white shadow-sm print:border-0 print:shadow-none">
        <header className="border-b-4 border-emerald-700 px-8 py-7 print:px-0 print:py-5">
          <div className="flex items-start justify-between gap-8">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center bg-emerald-700 text-lg font-black text-white">CC</div>
                <div>
                  <p className="text-lg font-black tracking-tight text-slate-950">CREDENCE CRAFT</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Retail &amp; Garment Solutions</p>
                </div>
              </div>
              <p className="mt-4 max-w-xs text-xs leading-5 text-slate-500">Point of Sale · Finished Goods Division<br />Organization sales invoice</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Original for recipient</p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-950">Tax Invoice</h1>
              <p className="mt-2 text-xs text-slate-500">Invoice No. <span className="font-bold text-slate-900">{invoice.invoiceNumber}</span></p>
              <p className="mt-1 text-xs text-slate-500">Invoice Date <span className="font-bold text-slate-900">{invoice.invoiceDate}</span></p>
            </div>
          </div>
        </header>

        <section className="grid border-b border-slate-200 sm:grid-cols-2">
          <div className="border-b border-slate-200 px-8 py-5 sm:border-b-0 sm:border-r print:px-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Bill From</p>
            <p className="mt-2 text-sm font-bold text-slate-950">Credence Craft</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Point of Sale Department<br />Finished Goods Stock</p>
          </div>
          <div className="px-8 py-5 print:px-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Bill To</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{invoice.customer || "Walk-in customer"}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Customer sale · Payment status: <span className="font-semibold text-amber-700">Pending</span></p>
          </div>
        </section>

        <section className="px-8 py-6 print:px-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 print:bg-white">
                <th className="w-8 px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Description of goods</th>
                <th className="px-3 py-3 text-left">Order / Barcode</th>
                <th className="px-3 py-3 text-left">Article / Size</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Rate</th>
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.lines.map((line, index) => (
                <tr key={line.record.id}>
                  <td className="px-3 py-4 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-4"><p className="font-bold text-slate-950">{line.record.style_name}</p><p className="mt-1 text-[10px] text-slate-500">{line.record.colour || "Colour not specified"}</p></td>
                  <td className="max-w-[150px] px-3 py-4 text-[10px] text-slate-600"><p>{line.record.order_no}</p><p className="mt-1 break-all text-slate-400">{line.record.id}</p></td>
                  <td className="px-3 py-4 text-slate-600"><p>{line.record.article_no}</p><p className="mt-1">{line.record.size || "-"}</p></td>
                  <td className="px-3 py-4 text-right font-semibold text-slate-900">{line.quantity}</td>
                  <td className="px-3 py-4 text-right text-slate-700">Rs {line.rate.toFixed(2)}</td>
                  <td className="px-3 py-4 text-right font-bold text-slate-950">Rs {line.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-3 text-sm">
              <div className="flex justify-between text-slate-600"><span>Taxable value</span><span>Rs {invoice.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-600"><span>GST @ {taxRate.toFixed(2)}%</span><span>Rs {taxAmount.toFixed(2)}</span></div>
              <div className="flex justify-between border-t-2 border-slate-900 pt-3 text-base font-black text-slate-950"><span>Grand total</span><span>Rs {grandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        </section>

        <footer className="grid gap-8 border-t border-slate-200 bg-slate-50 px-8 py-6 sm:grid-cols-2 print:bg-white print:px-0">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Amount in words</p><p className="mt-2 text-xs font-semibold text-slate-800">Indian Rupees {grandTotal.toFixed(2)} only</p><p className="mt-4 text-[10px] leading-4 text-slate-500">This is a computer-generated tax invoice and does not require a physical signature.</p></div>
          <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">For Credence Craft</p><div className="ml-auto mt-8 w-40 border-t border-slate-400 pt-2 text-[10px] text-slate-500">Authorized signatory</div></div>
        </footer>
      </article>
    </div>
  );
}