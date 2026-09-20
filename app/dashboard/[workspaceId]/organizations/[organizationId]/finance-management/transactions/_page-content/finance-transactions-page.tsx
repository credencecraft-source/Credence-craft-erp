"use client";

import { useEffect, useMemo, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
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

type FinanceReportField = keyof Pick<FinanceRecord, "documentType" | "documentNumber" | "date" | "party" | "sourceModule" | "sourceRecordId" | "amount" | "tax" | "net" | "status" | "paymentStatus">;

const reportFields: Array<{ key: FinanceReportField; label: string }> = [
  { key: "documentType", label: "Type" },
  { key: "documentNumber", label: "Document No." },
  { key: "date", label: "Date" },
  { key: "party", label: "Party" },
  { key: "sourceModule", label: "Source" },
  { key: "sourceRecordId", label: "Source Record" },
  { key: "amount", label: "Amount" },
  { key: "tax", label: "Tax" },
  { key: "net", label: "Net" },
  { key: "status", label: "Status" },
  { key: "paymentStatus", label: "Payment" },
];

export default function FinanceTransactionsPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [visibleFields, setVisibleFields] = useState<FinanceReportField[]>(reportFields.map((field) => field.key));

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

          <ReportGrid
            title="Finance Transactions Report"
            records={records}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(fields) => setVisibleFields(fields as FinanceReportField[])}
            storageKey={`credence-craft-finance-transactions-${organizationId}`}
            rowIdSelector={(record) => record.id}
            selectedIds={[]}
            onRowClick={() => undefined}
            renderCell={(fieldKey, record) => {
              if (["amount", "tax", "net"].includes(fieldKey)) return `Rs ${Number(record[fieldKey as "amount" | "tax" | "net"] ?? 0).toFixed(2)}`;
              return String(record[fieldKey as FinanceReportField] ?? "");
            }}
            emptyMessage="No finance transaction records found."
          />
        </Card>
      </Section>
    </Page>
  );
}
