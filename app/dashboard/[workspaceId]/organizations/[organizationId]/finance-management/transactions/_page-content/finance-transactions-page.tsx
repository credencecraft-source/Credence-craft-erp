"use client";

import { useEffect, useMemo, useState } from "react";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type FinanceRecord = {
  id: string;
  documentType: string;
  documentNumber: string;
  sourceModule: string;
  sourceRecordId: string;
  date: string;
  party: string;
  amount: number;
  tax: number;
  net: number;
  status: string;
  paymentStatus: string;
  archivedYear?: number | null;
};

type SavedPosInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  subtotal: number;
  taxAmount?: number;
  grandTotal?: number;
  savedAt: string;
};

export default function FinanceTransactionsPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [records, setRecords] = useState<FinanceRecord[]>([]);

  useEffect(() => {
    const nextRecords: FinanceRecord[] = [];

    try {
      const financeRecords = localStorage.getItem(
        `finance-documents-${organizationId}`,
      );
      if (financeRecords) {
        const parsed = JSON.parse(financeRecords) as FinanceRecord[];
        if (Array.isArray(parsed)) nextRecords.push(...parsed);
      }

      const posInvoices = localStorage.getItem(
        `pos-sales-invoices-${organizationId}`,
      );
      if (posInvoices) {
        const parsed = JSON.parse(posInvoices) as SavedPosInvoice[];
        if (Array.isArray(parsed)) {
          parsed.forEach((invoice) => {
            nextRecords.push({
              id: `pos-${invoice.invoiceNumber}`,
              documentType: "Sales Invoice",
              documentNumber: invoice.invoiceNumber,
              sourceModule: "POS",
              sourceRecordId: invoice.invoiceNumber,
              date: invoice.invoiceDate,
              party: invoice.customer || "Walk-in customer",
              amount: invoice.subtotal,
              tax: invoice.taxAmount ?? 0,
              net: invoice.grandTotal ?? invoice.subtotal + (invoice.taxAmount ?? 0),
              status: "Posted",
              paymentStatus: "Pending",
              archivedYear: new Date(invoice.invoiceDate).getFullYear(),
            });
          });
        }
      }
    } catch {
      // Ignore malformed local data and keep the list empty.
    }

    setRecords(
      nextRecords.sort(
        (left, right) =>
          new Date(right.date || "1970-01-01").getTime() -
          new Date(left.date || "1970-01-01").getTime(),
      ),
    );
  }, [organizationId]);

  const totals = useMemo(() => {
    const summary = {
      total: records.reduce((sum, item) => sum + item.net, 0),
      tax: records.reduce((sum, item) => sum + item.tax, 0),
      pending: records.filter((item) => item.paymentStatus !== "Paid").length,
      posted: records.filter((item) => item.status === "Posted").length,
    };

    return summary;
  }, [records]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Finance
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Finance Transactions
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Read-only transaction ledger for all finance-linked documents tied to their
            original operational modules.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Total net
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              Rs {totals.total.toFixed(2)}
            </p>
          </Card>
          <Card className="border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Tax
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              Rs {totals.tax.toFixed(2)}
            </p>
          </Card>
          <Card className="border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Pending
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {totals.pending}
            </p>
          </Card>
          <Card className="border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Posted
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {totals.posted}
            </p>
          </Card>
        </div>

        <Card className="border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Ledger
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">
                Transaction Register
              </h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              Read-only
            </span>
          </div>

          {records.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No finance records found for this organization yet.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Document No.</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Party</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3 text-right">Tax</th>
                    <th className="px-3 py-3 text-right">Net</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => (
                    <tr key={`${record.documentType}-${record.documentNumber}`}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{record.documentType}</td>
                      <td className="px-3 py-3 font-medium text-slate-700">{record.documentNumber}</td>
                      <td className="px-3 py-3 text-slate-600">{record.date}</td>
                      <td className="px-3 py-3 text-slate-700">{record.party}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <div className="font-medium text-slate-800">{record.sourceModule}</div>
                        <div className="text-[11px] text-slate-500">{record.sourceRecordId}</div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">Rs {record.amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-slate-700">Rs {record.tax.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">Rs {record.net.toFixed(2)}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                          {record.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                          {record.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>
    </Page>
  );
}
