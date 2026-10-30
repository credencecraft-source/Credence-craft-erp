"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

type PageSetupReportRow = {
  id: string;
  name: string;
  paperSize: string;
  orientation: string;
  stickerSize: string;
  margins: string;
  stickerGaps: string;
  updatedAt: string;
};

type ApiPageSetupTemplate = {
  id: string;
  name: string;
  paperSize: string;
  orientation: string;
  stickerWidthMm: number;
  stickerLengthMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  horizontalGapMm: number;
  verticalGapMm: number;
  updatedAt: string;
};

const fields: Array<{ key: keyof PageSetupReportRow; label: string }> = [
  { key: "name", label: "Template Name" },
  { key: "paperSize", label: "Paper Size" },
  { key: "orientation", label: "Orientation" },
  { key: "stickerSize", label: "Sticker Size" },
  { key: "margins", label: "Margins T/B/L/R (mm)" },
  { key: "stickerGaps", label: "Gaps H/V (mm)" },
  { key: "updatedAt", label: "Last Updated" },
];

export default function PageSetupTemplatesPage({
  workspaceId,
  organizationId,
  canManage,
}: {
  workspaceId: string;
  organizationId: string;
  canManage: boolean;
}) {
  const [visibleFields, setVisibleFields] = useState<Array<keyof PageSetupReportRow>>(
    fields.map(({ key }) => key),
  );
  const [records, setRecords] = useState<PageSetupReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const baseHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/page-setup`;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ organizationId, workspaceId });
    void fetch(`/api/design-development/page-setup-templates?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load Page Setup templates.");
        return data as { templates: ApiPageSetupTemplate[] };
      })
      .then(({ templates }) => {
        if (!active) return;
        setRecords(templates.map((template) => ({
          id: template.id,
          name: template.name,
          paperSize: template.paperSize,
          orientation: template.orientation,
          stickerSize: `${template.stickerWidthMm} × ${template.stickerLengthMm} mm`,
          margins: [
            template.marginTopMm,
            template.marginBottomMm,
            template.marginLeftMm,
            template.marginRightMm,
          ].join(" / "),
          stickerGaps: `${template.horizontalGapMm} / ${template.verticalGapMm}`,
          updatedAt: new Date(template.updatedAt).toLocaleDateString(),
        })));
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Unable to load Page Setup templates.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt, organizationId, workspaceId]);

  const requestDelete = (ids: string[]) => {
    setDeleteIds(ids);
    setDeleteError("");
  };

  const deleteSelectedTemplates = async () => {
    setIsDeleting(true);
    setDeleteError("");
    try {
      const query = new URLSearchParams({ organizationId, workspaceId });
      const response = await fetch(`/api/design-development/page-setup-templates?${query}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to delete Page Setup templates.");
      }

      const deletedIds = new Set(deleteIds);
      setRecords((current) => current.filter((record) => !deletedIds.has(record.id)));
      setSelectedIds((current) => current.filter((id) => !deletedIds.has(id)));
      setNotice(`${data.deletedCount} Page Setup template${data.deletedCount === 1 ? "" : "s"} deleted.`);
      setDeleteIds([]);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete Page Setup templates.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Page Setup</h1>
        <p className="text-sm text-slate-600">
          Reusable page format templates for future print layouts.
        </p>
      </header>

      {loadError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
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
      {notice && <p className="text-sm text-[var(--erp-success)]" role="status">{notice}</p>}
      <ReportGrid
        title="Page Setup Template Report"
        records={records}
        fields={fields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={(nextFields) =>
          setVisibleFields(nextFields as Array<keyof PageSetupReportRow>)
        }
        storageKey={`barcode-qr-page-setup:${organizationId}`}
        rowIdSelector={(record) => record.id}
        selectedIds={selectedIds}
        selectable={canManage}
        onToggleSelectAll={(checked, recordIds) =>
          setSelectedIds((current) => checked
            ? [...new Set([...current, ...recordIds])]
            : current.filter((id) => !recordIds.includes(id)))
        }
        onToggleRowSelection={(recordId, checked) =>
          setSelectedIds((current) => checked
            ? [...new Set([...current, recordId])]
            : current.filter((id) => id !== recordId))
        }
        onRecordClick={(record) => router.push(`${baseHref}/${encodeURIComponent(record.id)}`)}
        onBulkDeleteSelected={canManage ? () => requestDelete(selectedIds) : undefined}
        bulkDeleteSelectedLabel="Delete selected"
        rowActions={canManage ? (record) => (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => requestDelete([record.id])}
          >
            Delete
          </Button>
        ) : undefined}
        toolbarActions={canManage ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => router.push(`${baseHref}/create`)}
          >
            + Add Page Setup
          </Button>
        ) : undefined}
        renderCell={(fieldKey, record) =>
          String(record[fieldKey as keyof PageSetupReportRow] ?? "")
        }
        emptyMessage="No page setup templates found."
        isLoading={isLoading}
      />
      {deleteIds.length > 0 && (
        <Modal
          open
          onClose={() => {
            if (!isDeleting) setDeleteIds([]);
          }}
          ariaLabelledBy="delete-page-setup-title"
          size="square"
          variant="danger"
          closeOnBackdrop={!isDeleting}
        >
          <div className="space-y-4 p-6">
            <div>
              <h2 id="delete-page-setup-title" className="text-lg font-semibold text-slate-900">
                Delete selected Page Setup templates?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {deleteIds.length} template{deleteIds.length === 1 ? "" : "s"} will be removed. Existing print requests keep their saved layout snapshots.
              </p>
            </div>
            {deleteError && <p className="text-sm text-[var(--erp-danger)]" role="alert">{deleteError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteIds([])}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void deleteSelectedTemplates()}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : `Delete ${deleteIds.length} template${deleteIds.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
