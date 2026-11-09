"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { ReportGrid } from "@/components/reports/report-grid-display";
import Tabs from "@/components/ui/Tabs";

type DocumentType = "SALES_ORDER" | "QUOTATION" | "POS_INVOICE";
type PrintTemplate = {
  id: string;
  documentType: DocumentType;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type ReportRow = PrintTemplate & {
  documentLabel: string;
  defaultLabel: string;
  statusLabel: string;
  updatedLabel: string;
};

const fields: Array<{ key: keyof ReportRow; label: string }> = [
  { key: "name", label: "Template" },
  { key: "documentLabel", label: "Document Type" },
  { key: "defaultLabel", label: "Default" },
  { key: "statusLabel", label: "Status" },
  { key: "updatedLabel", label: "Last Updated" },
];

const documentTabs = [
  { label: "Sales Order", value: "SALES_ORDER" },
  { label: "Quotation", value: "QUOTATION" },
  { label: "POS Invoice", value: "POS_INVOICE" },
] as const;

function documentLabel(documentType: DocumentType) {
  if (documentType === "SALES_ORDER") return "Sales Order";
  if (documentType === "QUOTATION") return "Quotation";
  return "POS Invoice";
}

export default function ChallanPrintTemplateReportPage({
  workspaceId,
  organizationId,
  initialTemplates,
  initialDocumentType,
  confirmationName,
}: {
  workspaceId: string;
  organizationId: string;
  initialTemplates: PrintTemplate[];
  initialDocumentType: DocumentType;
  confirmationName?: string;
}) {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>(initialDocumentType);
  const [visibleFields, setVisibleFields] = useState<Array<keyof ReportRow>>(
    fields.map(({ key }) => key),
  );
  const records = useMemo<ReportRow[]>(() => initialTemplates
    .filter((template) => template.documentType === documentType)
    .map((template) => ({
      ...template,
      documentLabel: documentLabel(template.documentType),
      defaultLabel: template.isDefault ? "Default" : "—",
      statusLabel: template.isActive ? "Active" : "Inactive",
      updatedLabel: new Date(template.updatedAt).toLocaleString(),
    })), [documentType, initialTemplates]);
  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;
  const reportPath = `${organizationPath}/admin/challan-print-out`;

  return (
    <section className="min-w-0 space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--erp-text)]">Challan Print Out</h1>
          <p className="mt-1 text-sm text-[var(--erp-muted)]">
            Create reusable Sales Order, Quotation, and POS Invoice print formats and choose each document&apos;s default.
          </p>
        </div>
      </header>

      {confirmationName ? (
        <p className="rounded-lg border border-[var(--erp-brand-soft)] bg-[var(--erp-brand-soft)] p-3 text-sm text-[var(--erp-brand)]" role="status">
          Saved {confirmationName}. It is now available in the {documentLabel(documentType)} template report.
        </p>
      ) : null}

      <Tabs
        tabs={documentTabs}
        value={documentType}
        onChange={setDocumentType}
        ariaLabel="Print template document type"
      />

      <ReportGrid
        title={`${documentLabel(documentType)} Print Templates`}
        records={records}
        fields={fields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={(nextFields) => setVisibleFields(nextFields as Array<keyof ReportRow>)}
        storageKey={`challan-print-out:${organizationId}:${documentType}`}
        rowIdSelector={(record) => record.id}
        selectedIds={[]}
        selectable={false}
        onRecordClick={(record) => router.push(`${reportPath}/${encodeURIComponent(record.id)}`)}
        onNewOrder={() => router.push(`${reportPath}/create?documentType=${documentType}`)}
        newActionLabel="+ New Template"
        rowActions={(record) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => router.push(`${reportPath}/${encodeURIComponent(record.id)}`)}
          >
            View
          </Button>
        )}
        renderCell={(fieldKey, record) => {
          if (fieldKey === "defaultLabel") {
            return record.isDefault
              ? <Badge>Default</Badge>
              : "—";
          }
          if (fieldKey === "statusLabel") {
            return <Badge>{record.statusLabel}</Badge>;
          }
          return String(record[fieldKey as keyof ReportRow] ?? "");
        }}
        emptyMessage={`No ${documentLabel(documentType)} print templates yet. Create one to set the default print format.`}
      />
    </section>
  );
}
