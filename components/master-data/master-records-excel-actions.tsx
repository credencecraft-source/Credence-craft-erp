"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-models";
import type { MasterRecordsImportResult } from "@/lib/master-data/master-records-workbook";

type MasterLookupOption = { id: string; value_id?: string; label: string };
type MasterRecord = {
  id: string;
  value_id: string;
  label: string;
  code: string | null;
  description: string | null;
  metadata?: unknown;
};
type ChildRecord = { id?: string; parentId: string | null; label: string; fields?: Record<string, unknown> };
export type MasterRecordsImportAction = (formData: FormData) => Promise<MasterRecordsImportResult>;

type MasterRecordsExcelActionsProps = {
  records: MasterRecord[];
  fields: MasterFieldDefinition[];
  lookupOptions: Record<string, MasterLookupOption[]>;
  childRecords: ChildRecord[];
  moduleKey: string;
  moduleLabel: string;
  workspaceId: string;
  organizationId: string;
  importAction: MasterRecordsImportAction;
};

function recordFields(record: MasterRecord) {
  if (!record.metadata || typeof record.metadata !== "object") return {};
  const metadata = record.metadata as Record<string, unknown>;
  return metadata.fields && typeof metadata.fields === "object"
    ? metadata.fields as Record<string, unknown>
    : {};
}

function optionLabel(value: unknown, options: MasterLookupOption[] = []) {
  const key = String(value ?? "");
  const match = options.find((option) =>
    [option.id, option.value_id, option.label].some((candidate) =>
      candidate !== undefined && String(candidate).toLocaleLowerCase() === key.toLocaleLowerCase(),
    ),
  );
  return match?.label ?? key;
}

function exportFieldValue(
  field: MasterFieldDefinition,
  value: unknown,
  lookupOptions: Record<string, MasterLookupOption[]>,
  children: ChildRecord[],
) {
  if (field.type === "image" && typeof value === "string" && value.startsWith("data:")) return "";
  if (field.type === "child-list") {
    return JSON.stringify(children.map((child) => Object.fromEntries(
      (field.childFields ?? []).map((childField) => [
        childField.label,
        childField.type === "lookup"
          ? optionLabel(child.fields?.[childField.key], lookupOptions[childField.lookupModuleKey ?? ""])
          : child.fields?.[childField.key] ?? "",
      ]),
    )));
  }

  const normalizedValue = value === null || value === undefined || value === ""
    ? field.multiple && children.length ? children.map((child) => child.label) : value
    : value;
  if (normalizedValue === null || normalizedValue === undefined || normalizedValue === "") return "";
  if (field.type === "lookup" && field.lookupModuleKey) {
    const options = lookupOptions[field.lookupModuleKey] ?? [];
    return Array.isArray(normalizedValue)
      ? normalizedValue.map((item) => optionLabel(item, options)).join("; ")
      : optionLabel(normalizedValue, options);
  }
  if (Array.isArray(normalizedValue)) return normalizedValue.join("; ");
  if (typeof normalizedValue === "object") return JSON.stringify(normalizedValue);
  return normalizedValue;
}

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
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const downloadWorkbook = (includeRecords = true) => {
    const headers = [
      ...fields.filter((field) => !field.readOnly).map((field) => field.label),
      "Master Code",
      "Description",
    ];
    const rows = includeRecords ? records.map((record) => {
      const values = recordFields(record);
      return [
        ...fields.filter((field) => !field.readOnly).map((field) => {
          const relatedChildren = childRecords.filter((child) => child.parentId === record.id);
          return exportFieldValue(
            field,
            values[field.key],
            lookupOptions,
            relatedChildren,
          );
        }),
        record.code ?? "",
        record.description ?? "",
      ];
    }) : [];
    const workbook = XLSX.utils.book_new();
    const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(workbook, dataSheet, "Data");
    const instructions = XLSX.utils.aoa_to_sheet([
      ["Master Data Import Instructions"],
      ["Use the Data sheet and keep its header names unchanged."],
      ["Imports create new records only. Existing matching records are not overwritten."],
      ["Each row saves independently. Review the import result for rejected rows."],
      ["For child-list columns, provide a JSON array of objects using the child field labels as keys."],
      ["Multiple lookup values may be separated with semicolons."],
      ["Text values are normalized to uppercase when saved."],
      ["Use Download blank template in the upload dialog to start without existing records."],
    ]);
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${moduleKey}-master${includeRecords ? "" : "-template"}.xlsx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          onClick={() => downloadWorkbook(true)}
          aria-label={`Download ${moduleLabel} Excel workbook`}
          title={`Download ${moduleLabel} Excel workbook`}
        >
          <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Download Excel
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
            <Button type="button" variant="secondary" onClick={() => downloadWorkbook(false)}>
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
