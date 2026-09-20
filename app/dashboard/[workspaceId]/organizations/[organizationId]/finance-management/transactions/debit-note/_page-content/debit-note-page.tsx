"use client";

import { useEffect, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
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

const reportFields: Array<{ key: keyof FinanceRecord; label: string }> = [
  { key: "documentNumber", label: "Document No." },
  { key: "date", label: "Date" },
  { key: "party", label: "Party" },
  { key: "sourceModule", label: "Source Module" },
  { key: "sourceRecordId", label: "Source Record" },
  { key: "amount", label: "Amount" },
  { key: "tax", label: "Tax" },
  { key: "net", label: "Net" },
];

export default function DebitNotePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [visibleReportFields, setVisibleReportFields] = useState<Array<string | keyof FinanceRecord>>(
    reportFields.map((field) => field.key),
  );

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
          (record) => record.documentType === "Debit Note",
        ),
      );
    } catch {
      setRecords([]);
    }
  }, [organizationId]);

  const renderCell = (fieldKey: string, record: FinanceRecord) => {
    switch (fieldKey) {
      case "sourceModule":
        return (
          <div>
            <div className="font-medium text-slate-800">{record.sourceModule}</div>
            <div className="text-[11px] text-slate-500">{record.sourceRecordId}</div>
          </div>
        );
      case "amount":
        return <span>Rs {record.amount.toFixed(2)}</span>;
      case "tax":
        return <span>Rs {record.tax.toFixed(2)}</span>;
      case "net":
        return <span className="font-bold text-slate-900">Rs {record.net.toFixed(2)}</span>;
      default:
        return String(record[fieldKey as keyof FinanceRecord] ?? "");
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Debit Note</h1>
          </div>
        </div>

        <ReportGrid
          title="Debit Note Report"
          records={records}
          fields={reportFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={setVisibleReportFields}
          rowIdSelector={(record) => `${record.id}-${record.documentNumber}`}
          selectedIds={[]}
          onRowClick={() => undefined}
          renderCell={renderCell}
          emptyMessage="No debit note records found."
        />
      </Section>
    </Page>
  );
}
