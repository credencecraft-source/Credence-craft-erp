"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type SavedPosInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  lines: Array<{
    record: {
      id: string;
      style_name: string;
      order_no: string;
      article_no: string;
      size: string | null;
      colour: string | null;
      hsn_code?: string | null;
    };
    quantity: number;
    rate: number;
    gstRate?: number;
    amount: number;
  }>;
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  savedAt: string;
};

const reportFields: Array<{ key: keyof SavedPosInvoice; label: string }> = [
  { key: "invoiceNumber", label: "Invoice No." },
  { key: "invoiceDate", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "subtotal", label: "Total" },
];

export default function SalesInvoicePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [invoices, setInvoices] = useState<SavedPosInvoice[]>([]);
  const [selected, setSelected] = useState<SavedPosInvoice | null>(null);
  const [visibleReportFields, setVisibleReportFields] = useState<Array<string | keyof SavedPosInvoice>>(
    reportFields.map((field) => field.key),
  );
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions`;
  const createPath = `${base}/sales-invoice/new`;

  useEffect(() => {
    const stored = window.localStorage.getItem(`pos-sales-invoices-${organizationId}`);
    if (!stored) {
      setInvoices([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as SavedPosInvoice[];
      setInvoices(Array.isArray(parsed) ? parsed : []);
    } catch {
      setInvoices([]);
    }
  }, [organizationId]);

  const renderCell = (fieldKey: string, record: SavedPosInvoice) => {
    switch (fieldKey) {
      case "customer":
        return record.customer || "Walk-in customer";
      case "quantity":
        return record.lines.reduce((sum, line) => sum + line.quantity, 0);
      case "subtotal":
        return <span className="font-semibold text-slate-900">Rs {record.subtotal.toFixed(2)}</span>;
      default:
        return String(record[fieldKey as keyof SavedPosInvoice] ?? "");
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Link href={base} className="text-xs font-semibold text-sky-700">
              &larr; Transactions
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Sales Invoice</h1>
          </div>
          <Link
            href={createPath}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Create New
          </Link>
        </div>

        {selected ? (
          <InvoicePreview invoice={selected} onBack={() => setSelected(null)} />
        ) : (
          <ReportGrid
            title="Sales Invoice Report"
            records={invoices}
            fields={reportFields}
            visibleFields={visibleReportFields}
            onVisibleFieldsChange={setVisibleReportFields}
            rowIdSelector={(record) => record.invoiceNumber}
            selectedIds={[]}
            onRowClick={(recordId) => {
              const invoice = invoices.find((entry) => entry.invoiceNumber === recordId);
              if (invoice) setSelected(invoice);
            }}
            renderCell={renderCell}
            emptyMessage="No sales invoice records found."
          />
        )}
      </Section>
    </Page>
  );
}

function InvoicePreview({
  invoice,
  onBack,
}: {
  invoice: SavedPosInvoice;
  onBack: () => void;
}) {
  const taxRate = invoice.taxRate ?? 0;
  const taxAmount = invoice.taxAmount ?? invoice.subtotal * taxRate / 100;
  const grandTotal = invoice.grandTotal ?? invoice.subtotal + taxAmount;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-semibold text-sky-700"
        >
          &larr; Sales Invoice report
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      <article className="overflow-hidden border border-slate-300 bg-white shadow-sm print:border-0 print:shadow-none">
        <header className="border-b-4 border-sky-700 px-8 py-7 print:px-0 print:py-5">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">
                Finance
              </p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-950">
                Sales Invoice
              </h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Invoice No.</p>
              <p className="mt-1 text-lg font-black text-slate-950">{invoice.invoiceNumber}</p>
              <p className="mt-1 text-xs text-slate-500">{invoice.invoiceDate}</p>
            </div>
          </div>
        </header>

        <section className="grid border-b border-slate-200 sm:grid-cols-2">
          <div className="border-b border-slate-200 px-8 py-5 sm:border-b-0 sm:border-r print:px-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Bill To
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              {invoice.customer || "Walk-in customer"}
            </p>
          </div>
          <div className="px-8 py-5 print:px-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Source
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">POS</p>
          </div>
        </section>

        <section className="px-8 py-6 print:px-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Rate</th>
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.lines.map((line, index) => (
                <tr key={`${line.record.id}-${index}`}>
                  <td className="px-3 py-4 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-4">
                    <p className="font-bold text-slate-950">{line.record.style_name}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {line.record.order_no} / {line.record.article_no}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-right font-semibold text-slate-900">
                    {line.quantity}
                  </td>
                  <td className="px-3 py-4 text-right text-slate-700">Rs {line.rate.toFixed(2)}</td>
                  <td className="px-3 py-4 text-right font-bold text-slate-950">
                    Rs {line.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-semibold">Rs {invoice.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tax ({taxRate}%)</span>
                <span className="font-semibold">Rs {taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-300 pt-2 text-base font-black text-slate-950">
                <span>Total</span>
                <span>Rs {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
