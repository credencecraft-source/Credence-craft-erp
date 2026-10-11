"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  createMasterRecordsTemplateWorkbook,
  type MasterWorkbookChildRecord,
  type MasterWorkbookLookupOption,
  type MasterWorkbookRecord,
} from "@/lib/master-data/master-records-template-workbook";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-models";
import type { MasterRecordsImportResult } from "@/lib/master-data/master-records-workbook";

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
  importAction,
}: MasterRecordsExcelActionsProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<MasterRecordsImportResult | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const downloadWorkbook = async (includeRecords = true) => {
    setDownloadError("");
    setIsGenerating(true);
    try {
      const workbookData = await createMasterRecordsTemplateWorkbook({
        records: includeRecords ? records : [],
        fields,
        lookupOptions,
        childRecords,
        moduleLabel,
      });
      const blob = new Blob([workbookData], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${moduleKey}-master${includeRecords ? "" : "-template"}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError("Unable to create the Excel workbook. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const importSelectedWorkbook = () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("organizationId", organizationId);
    formData.set("moduleKey", moduleKey);
    formData.set("workbook", selectedFile);
    setResult(null);
    startTransition(async () => {
      try {
        const importResult = await importAction(formData);
        setResult(importResult);
        if (importResult.created > 0) router.refresh();
      } catch {
        setResult({ created: 0, failures: [], fatalError: "The workbook could not be imported. Check your file and try again." });
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void downloadWorkbook(true)}
          disabled={isGenerating}
          aria-label={`Download ${moduleLabel} Excel workbook`}
          title={`Download ${moduleLabel} Excel workbook`}
        >
          <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
          {isGenerating ? "Preparing..." : "Download Excel"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelectedFile(null);
            setResult(null);
            setIsOpen(true);
          }}
          aria-label={`Upload ${moduleLabel} Excel workbook`}
          title={`Upload ${moduleLabel} Excel workbook`}
        >
          <Upload aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Upload Excel
        </Button>
      </div>
      {downloadError ? <p className="text-sm text-slate-700" role="alert">{downloadError}</p> : null}

      <Modal open={isOpen} onClose={() => setIsOpen(false)} ariaLabel={`Import ${moduleLabel} Excel workbook`} size="md">
        <div className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">Import {moduleLabel} Excel</h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose an .xlsx workbook for this master. Only new records are created; matching records are not overwritten. Use a blank template for new entries, or remove existing rows from an exported workbook before uploading. Valid rows save independently.
            </p>
          </div>
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
              setResult(null);
            }}
            aria-label="Excel workbook file"
          />
          {selectedFile ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
              {selectedFile.name}
            </p>
          ) : null}
          {result?.fatalError ? <p className="text-sm text-slate-700" role="alert">{result.fatalError}</p> : null}
          {result && !result.fatalError ? (
            <div className="space-y-2 text-sm" role={result.failures.length ? "alert" : "status"}>
              <p>Created {result.created} record{result.created === 1 ? "" : "s"}; {result.failures.length} row{result.failures.length === 1 ? "" : "s"} failed.</p>
              {result.failures.length ? (
                <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                  {result.failures.slice(0, 10).map((failure) => (
                    <li key={`${failure.rowNumber}-${failure.message}`}>Row {failure.rowNumber}: {failure.message}</li>
                  ))}
                </ul>
              ) : null}
              {result.failures.length > 10 ? <p>{result.failures.length - 10} additional row errors are not shown.</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void downloadWorkbook(false)} disabled={isGenerating}>
              <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
              Download blank template
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isPending}>
              Close
            </Button>
            <Button type="button" variant="primary" onClick={importSelectedWorkbook} disabled={!selectedFile || isPending}>
              {isPending ? "Importing..." : "Import workbook"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
