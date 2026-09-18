"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
};

export default function CreditNotePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions`;

  useEffect(() => {
    const stored = window.localStorage.getItem(`finance-documents-${organizationId}`);
    if (!stored) {
      setRecords([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as FinanceRecord[];
      setRecords(
        (Array.isArray(parsed) ? parsed : []).filter(
          (record) => record.documentType === "Credit Note",
        ),
      );
    } catch {
      setRecords([]);
    }
  }, [organizationId]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Link href={base} className="text-xs font-semibold text-sky-700">&larr; Transactions</Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Credit Note</h1>
          </div>
        </div>

        <Card className="border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Report</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Credit Note Report</h2>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No credit note records found.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Document No.</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Party</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3 text-right">Tax</th>
                    <th className="px-3 py-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => (
                    <tr key={`${record.id}-${record.documentNumber}`}>
                      <td className="px-3 py-3 font-bold text-slate-900">{record.documentNumber}</td>
                      <td className="px-3 py-3 text-slate-600">{record.date}</td>
                      <td className="px-3 py-3 text-slate-700">{record.party}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <div className="font-medium text-slate-800">{record.sourceModule}</div>
                        <div className="text-[11px] text-slate-500">{record.sourceRecordId}</div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">Rs {record.amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-slate-700">Rs {record.tax.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">Rs {record.net.toFixed(2)}</td>
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
