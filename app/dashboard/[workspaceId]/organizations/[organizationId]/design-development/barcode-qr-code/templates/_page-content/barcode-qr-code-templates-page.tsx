"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import { ORDER_QR_TEMPLATE_FIELDS } from "@/lib/services/orders/order-qr-template-contract";

type TemplateReportRow = {
  id: string;
  name: string;
  type: string;
  fields: string;
  qrSize: string;
  updatedAt: string;
};

const fields: Array<{ key: keyof TemplateReportRow; label: string }> = [
  { key: "name", label: "Template Name" },
  { key: "type", label: "Type" },
  { key: "fields", label: "Order Fields" },
  { key: "qrSize", label: "QR Size" },
  { key: "updatedAt", label: "Last Updated" },
];

type ApiTemplate = {
  id: string;
  name: string;
  type: string;
  fieldKeys: string[];
  qrSize: number;
  updatedAt: string;
};

export default function BarcodeQrCodeTemplatesPage({
  workspaceId,
  organizationId,
  createHref,
}: {
  workspaceId: string;
  organizationId: string;
  createHref: string;
}) {
  const [visibleFields, setVisibleFields] = useState<Array<keyof TemplateReportRow>>(
    fields.map(({ key }) => key),
  );
  const [records, setRecords] = useState<TemplateReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const router = useRouter();
  const templateBaseHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates`;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ organizationId, workspaceId });

    void fetch(`/api/orders/qr-templates?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load QR templates.");
        }
        return data as { templates: ApiTemplate[] };
      })
      .then(({ templates }) => {
        if (!active) return;
        setRecords(templates.map((template) => ({
          id: template.id,
          name: template.name,
          type: template.type === "ORDER_TAGS" ? "Order Tags" : template.type,
          fields: template.fieldKeys
            .map((key) => ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === key)?.label ?? key)
            .join(", "),
          qrSize: `${template.qrSize} px`,
          updatedAt: new Date(template.updatedAt).toLocaleDateString(),
        })));
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load QR templates.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt, organizationId, workspaceId]);

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Templates</h1>
        <p className="text-sm text-slate-600">
          Reusable barcode and QR code templates.
        </p>
      </header>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]" role="alert">
          <span>{loadError}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      <ReportGrid
        title="Template Report"
        records={records}
        fields={fields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={(nextFields) =>
          setVisibleFields(nextFields as Array<keyof TemplateReportRow>)
        }
        storageKey={`barcode-qr-code-templates:${organizationId}`}
        rowIdSelector={(record) => record.id}
        selectedIds={[]}
        onRecordClick={(record) => router.push(`${templateBaseHref}/${encodeURIComponent(record.id)}`)}
        toolbarActions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => router.push(createHref)}
          >
            + Add Template
          </Button>
        }
        renderCell={(fieldKey, record) =>
          String(record[fieldKey as keyof TemplateReportRow] ?? "")
        }
        emptyMessage="No templates found."
        isLoading={isLoading}
      />
    </section>
  );
}
