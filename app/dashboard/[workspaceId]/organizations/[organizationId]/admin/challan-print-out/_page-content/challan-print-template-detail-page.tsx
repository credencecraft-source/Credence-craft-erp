"use client";

import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { OrganizationPrintTemplateDesign } from "@/lib/services/distribution/organization-print-template-contract";

type DocumentType = "SALES_ORDER" | "QUOTATION" | "POS_INVOICE";

export default function ChallanPrintTemplateDetailPage({
  workspaceId,
  organizationId,
  template,
}: {
  workspaceId: string;
  organizationId: string;
  template: {
    id: string;
    documentType: DocumentType;
    name: string;
    isActive: boolean;
    isDefault: boolean;
    designConfig: OrganizationPrintTemplateDesign;
    createdAt: string;
    updatedAt: string;
  };
}) {
  const router = useRouter();
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/challan-print-out`;
  const design = template.designConfig;
  const values = [
    ["Paper", `${design.pageSize} · ${design.orientation.toLowerCase()}`],
    ["Font", `${design.fontFamily} · body ${design.bodyFontSize} pt · heading ${design.headingFontSize} pt`],
    ["Margins", `Top ${design.margins.top} · Right ${design.margins.right} · Bottom ${design.margins.bottom} · Left ${design.margins.left} mm`],
    ["Text color", design.textColor],
    ["Heading/accent color", design.accentColor],
    ["Table header", `${design.tableHeaderColor} · text ${design.tableHeaderTextColor}`],
    ["Header fields", design.sections.headerFields.join(", ") || "None"],
    ["Item table fields", design.sections.itemFields.join(", ")],
    ["Summary fields", design.sections.summaryFields.join(", ") || "None"],
    ["Header text", design.headerText || "None"],
    ["Payment terms", design.sections.showPaymentTerms ? design.sections.paymentTermsText || "Not set" : "Hidden"],
    ["Special notes", design.sections.showSpecialNotes ? "Shown" : "Hidden"],
    ["Footer text", design.footerText || "None"],
    ["Page numbers", design.showPageNumbers ? "Shown" : "Hidden"],
  ];

  return (
    <section className="min-w-0 space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-[var(--erp-text)]">{template.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge>{template.documentType === "SALES_ORDER" ? "Sales Order" : "Quotation"}</Badge>
            <Badge>{template.isActive ? "Active" : "Inactive"}</Badge>
            {template.isDefault ? <Badge>Default format</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>Back to Report</Button>
          <Button
            type="button"
            onClick={() => router.push(`${reportPath}/${encodeURIComponent(template.id)}/edit`)}
          >
            Edit
          </Button>
        </div>
      </header>
      <section className="erp-surface overflow-hidden">
        <h2 className="border-b border-[var(--erp-border)] px-6 py-4 text-base font-semibold text-[var(--erp-text)]">Saved print settings</h2>
        <dl className="divide-y divide-[var(--erp-border)]">
          {values.map(([label, value]) => (
            <div key={label} className="grid min-w-0 gap-1 px-6 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-[var(--erp-muted)]">{label}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-[var(--erp-text)]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}
