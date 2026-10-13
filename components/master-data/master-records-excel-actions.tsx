"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import type {
  MasterWorkbookChildRecord,
  MasterWorkbookLookupOption,
  MasterWorkbookRecord,
} from "@/lib/master-data/master-records-template-workbook";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-models";
import { uploadMasterWorkbookToHistory } from "@/lib/master-data/master-import-client";
import type {
  MasterRecordsImportResult,
} from "@/lib/master-data/master-records-workbook";

type MasterRecord = MasterWorkbookRecord & { label: string; value_id: string };
type ChildRecord = MasterWorkbookChildRecord & { id?: string };
export type MasterRecordsImportAction = (formData: FormData) => Promise<MasterRecordsImportResult>;

type MasterRecordsExcelActionsProps = {
  records: MasterRecord[];
  fields: MasterFieldDefinition[];
  lookupOptions: Record<string, MasterWorkbookLookupOption[]>;
  childRecords: ChildRecord[];
  moduleKey: string;
  moduleLabel: string;
  workspaceId: string;
  organizationId: string;
  importAction: MasterRecordsImportAction;
};

export function MasterRecordsExcelActions({
  records,
  fields,
  lookupOptions,
  childRecords,
  moduleKey,
  moduleLabel,
  workspaceId,
  organizationId,
}: MasterRecordsExcelActionsProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const historyUrl = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/migration/import-history`;

  const downloadWorkbook = async (includeRecords = true) => {
    setError("");
    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(moduleKey)}/workbook`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            includeRecords,
            records: includeRecords ? records : [],
            fields,
            lookupOptions,
            childRecords,
            moduleLabel,
          }),
        },
      );
      if (!response.ok) throw new Error("Unable to create this master workbook.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${moduleKey}-master${includeRecords ? "" : "-template"}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to create this master workbook.");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveWorkbook = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      await uploadMasterWorkbookToHistory(organizationId, moduleKey, selectedFile);
      setNotice("Workbook securely saved on the server. Continue staging, correcting, and importing from Import History.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to save this workbook to Import History.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void downloadWorkbook(true)}
          disabled={isGenerating}
          aria-label={`Download ${moduleLabel} Excel workbook`}
          title={`Download ${moduleLabel} Excel workbook`}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {isGenerating ? "Preparing..." : "Download Excel"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelectedFile(null);
            setNotice("");
            setError("");
            setIsOpen(true);
          }}
          aria-label={`Upload ${moduleLabel} Excel workbook`}
          title={`Upload ${moduleLabel} Excel workbook`}
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
          Upload Excel
        </Button>
        {error ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
      </div>
      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        closeOnBackdrop={false}
        ariaLabel={`Save ${moduleLabel} workbook`}
        size="md"
      >
        <div className="space-y-4 p-6">
          <header>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Upload {moduleLabel} Excel</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Save the workbook to server-backed Import History. Stage and validate it there, correct rows with errors, then explicitly start or resume the import. Uploading does not create master records.
            </p>
          </header>
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            aria-label="Excel workbook file"
          />
          {selectedFile ? (
            <p className="flex min-w-0 items-center gap-2 truncate text-sm text-[var(--erp-muted)]">
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4 shrink-0" />
              {selectedFile.name}
            </p>
          ) : null}
          {notice ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-success)]" role="status">
              <span>{notice}</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => {
                setIsOpen(false);
                router.push(historyUrl);
              }}>
                Open Import History
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void downloadWorkbook(false)} disabled={isGenerating}>
              <Download aria-hidden="true" className="h-4 w-4" />
              Download blank template
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isSaving}>
              Close
            </Button>
            <Button type="button" onClick={() => void saveWorkbook()} disabled={!selectedFile || isSaving}>
              {isSaving ? "Saving to server..." : "Save to Import History"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
