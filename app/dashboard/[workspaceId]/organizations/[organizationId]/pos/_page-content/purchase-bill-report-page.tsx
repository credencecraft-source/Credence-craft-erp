"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type PurchaseBillRecord = {
  id: string;
  documentType: string;
  documentNumber: string;
  sourceModule: string;
  date: string;
  party: string;
  amount: number;
  tax: number;
  net: number;
  status: string;
  paymentStatus: string;
};

const reportFields: Array<{ key: keyof PurchaseBillRecord; label: string }> = [
  { key: "documentNumber", label: "Bill No." },
  { key: "date", label: "Date" },
  { key: "party", label: "Vendor" },
  { key: "amount", label: "Taxable Amount" },
  { key: "tax", label: "GST" },
  { key: "net", label: "Total Amount" },
  { key: "status", label: "Status" },
];

export default function PurchaseBillReportPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<PurchaseBillRecord[]>([]);
  const [visibleReportFields, setVisibleReportFields] = useState<
    Array<string | keyof PurchaseBillRecord>
  >(reportFields.map((field) => field.key));
  const [successMessage, setSuccessMessage] = useState(
    () => searchParams.get("success") ?? "",
  );
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos`;
  const createPath = `${base}/purchase-bill/new`;

  useEffect(() => {
    fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          bills?: PurchaseBillRecord[];
        };
        if (!response.ok) throw new Error("Unable to load purchase bills.");
        setRecords(Array.isArray(data.bills) ? data.bills : []);
      })
      .catch(() => setRecords([]));
  }, [organizationId]);

  const renderCell = (fieldKey: string, record: PurchaseBillRecord) => {
    if (["amount", "tax", "net"].includes(fieldKey)) {
      const value = Number(record[fieldKey as "amount" | "tax" | "net"] ?? 0);
      return (
        <span
          className={
            fieldKey === "net" ? "font-bold text-slate-900" : "text-slate-700"
          }
        >
          Rs {value.toFixed(2)}
        </span>
      );
    }
    return String(record[fieldKey as keyof PurchaseBillRecord] ?? "");
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Link
              href={base}
              className="text-xs font-semibold text-emerald-700"
            >
              &larr; POS
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              Purchase Bills
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Standard purchase bill report for vendor purchases.
            </p>
          </div>
          <Link
            href={createPath}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + New Purchase Bill
          </Link>
        </div>
        <ReportGrid
          title="Purchase Bill Report"
          records={records}
          fields={reportFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={setVisibleReportFields}
          rowIdSelector={(record) => `${record.id}-${record.documentNumber}`}
          selectedIds={[]}
          onRowClick={() => undefined}
          renderCell={renderCell}
          emptyMessage="No purchase bill records found."
        />
      </Section>
      <Modal
        open={Boolean(successMessage)}
        onClose={() => {
          setSuccessMessage("");
          router.replace(`${base}/purchase-bill`);
        }}
        ariaLabel="Purchase bill posted successfully"
        variant="success"
        size="sm"
      >
        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Posted successfully
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Purchase bill saved
            </h2>
            <p className="mt-2 text-sm text-slate-600">{successMessage}</p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSuccessMessage("");
                router.replace(`${base}/purchase-bill`);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
