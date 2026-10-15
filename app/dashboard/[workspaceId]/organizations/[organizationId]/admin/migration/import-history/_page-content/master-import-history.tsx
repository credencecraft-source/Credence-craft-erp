"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, RefreshCw, Trash2, Upload } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";
import {
  createContactCorrectionDraft,
  createContactCorrectionRow,
} from "@/lib/master-data/contact-import-corrections";
import type { MasterImportCorrectionRow } from "@/components/master-data/master-import-correction";
import { MasterImportCorrection } from "@/components/master-data/master-import-correction";
import type { ContactInput } from "@/lib/services/master-data/contact-master-validation";

type ImportModule = {
  key: string;
  label: string;
  fields: Array<{ key: string; label: string; type: string; multiple: boolean }>;
};
type ImportJob = {
  id: string;
  moduleKey: string;
  status: string;
  uploadedFileName: string;
  uploadedFileSize: number;
  fileChunkCount: number;
  uploadedFileChunks: number;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  uploaderDisplayName?: string | null;
};
type ImportRow = {
  rowNumber: number;
  status: string;
  checkpoint: string | null;
  payload: unknown;
};
type BackgroundImportRun = {
  id: string;
  operation: string;
  status: string;
  progress: number;
  total: number;
  error?: unknown;
};
const MAX_VISIBLE_CORRECTION_ROWS = 50;
const UPLOAD_CHUNK_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function readRowValidationErrors(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("validationErrors" in payload)
    || !Array.isArray(payload.validationErrors)) return [] as Array<{ message: string; fieldPaths: string[] }>;
  return payload.validationErrors.flatMap((error) => {
    if (typeof error === "string") return [{ message: error, fieldPaths: [] }];
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
      return [{
        message: error.message,
        fieldPaths: "fieldPaths" in error && Array.isArray(error.fieldPaths)
          ? error.fieldPaths.filter((path: unknown): path is string => typeof path === "string")
          : [],
      }];
    }
    return [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackgroundImportRun(value: unknown): value is BackgroundImportRun {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.operation === "string"
    && typeof value.status === "string"
    && Number.isSafeInteger(value.progress)
    && Number.isSafeInteger(value.total);
}

function readRowErrors(payload: unknown) {
  return readRowValidationErrors(payload).map((error) => error.message);
}

function readRowIdentity(payload: unknown, rowNumber: number) {
  if (typeof payload !== "object" || payload === null) return `Row ${rowNumber}`;
  if ("contactKey" in payload && typeof payload.contactKey === "string") return payload.contactKey;
  if ("rowNumber" in payload && typeof payload.rowNumber === "number") return `Workbook row ${payload.rowNumber}`;
  return `Row ${rowNumber}`;
}

const STATUS_LABELS: Record<string, string> = {
  UPLOADING: "Uploading",
  UPLOADED: "Uploaded",
  STAGED: "Staged",
  VALIDATED: "Validated",
  IMPORTING: "Importing",
  PARTIAL: "Interrupted",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && "error" in payload
    && typeof payload.error === "string") return payload.error;
  return fallback;
}

export default function MasterImportHistory({
  workspaceId,
  organizationId,
  modules,
}: {
  workspaceId: string;
  organizationId: string;
  modules: ImportModule[];
}) {
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/master-imports`;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedModule, setSelectedModule] = useState(modules[0]?.key ?? "contact");
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ jobId: string; uploadedBytes: number; totalBytes: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [activeRows, setActiveRows] = useState<ImportRow[]>([]);
  const [selectedValidationRowIds, setSelectedValidationRowIds] = useState<string[]>([]);
  const [deleteTargetJob, setDeleteTargetJob] = useState<ImportJob | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [correctionRows, setCorrectionRows] = useState<MasterImportCorrectionRow[]>([]);
  const [correctionEdits, setCorrectionEdits] = useState<Record<string, Record<string, string>>>({});

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to load import history."));
      if (typeof payload !== "object" || payload === null || !("jobs" in payload) || !Array.isArray(payload.jobs)) {
        throw new Error("Import history response is invalid.");
      }
      setJobs(payload.jobs as ImportJob[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load import history.");
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  const downloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    setError("");
    setNotice("");
    try {
      const response = selectedModule === "contact"
        ? await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/contacts/workbook`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contacts: [] }),
        })
        : await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(selectedModule)}/workbook/template`,
          { cache: "no-store" },
        );

      if (!response.ok) {
        const payload: unknown = response.headers.get("content-type")?.includes("application/json")
          ? await response.json()
          : null;
        throw new Error(errorMessage(payload, "Unable to download this master template."));
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error("The master template is empty. Try again.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = selectedModule === "contact"
        ? "unified-contact-master-template.xlsx"
        : `${selectedModule}-master-template.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download this master template.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const deleteJob = async () => {
    if (!deleteTargetJob) return;
    const job = deleteTargetJob;
    setDeletingJobId(job.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(job.id)}`, { method: "DELETE" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to delete this uploaded workbook."));
      setDeleteTargetJob(null);
      setNotice("Uploaded workbook and its staged rows were deleted from Import History.");
      setIsLoading(true);
      await loadJobs();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this uploaded workbook.");
    } finally {
      setDeletingJobId(null);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadJobs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return jobs;
    return jobs.filter((job) => {
      const moduleName = modules.find((module) => module.key === job.moduleKey)?.label ?? job.moduleKey;
      return `${job.uploadedFileName} ${moduleName} ${STATUS_LABELS[job.status] ?? job.status}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [jobs, modules, search]);

  const handleUpload = async (file: File | null = selectedFile) => {
    if (!file) {
      setError("Choose an .xlsx workbook to upload.");
      return;
    }
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES || !file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose an .xlsx workbook between 1 byte and 50 MiB.");
      return;
    }
    setIsUploading(true);
    setError("");
    setNotice("");
    try {
      const fileHashBytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sourceSha256 = Array.from(new Uint8Array(fileHashBytes), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const initResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleKey: selectedModule,
          uploadedFileName: file.name,
          uploadedFileSize: file.size,
          sourceSha256,
        }),
      });
      const initPayload: unknown = await initResponse.json();
      if (!initResponse.ok) throw new Error(errorMessage(initPayload, "Unable to start this workbook upload."));
      if (!isRecord(initPayload) || !isRecord(initPayload.job)
        || typeof initPayload.job.id !== "string"
        || typeof initPayload.job.uploadedFileChunks !== "number"
        || typeof initPayload.job.fileChunkCount !== "number") {
        throw new Error("Workbook upload response is invalid.");
      }
      const job = initPayload.job as unknown as ImportJob;
      setUploadProgress({
        jobId: job.id,
        uploadedBytes: Math.min(job.uploadedFileChunks * UPLOAD_CHUNK_BYTES, file.size),
        totalBytes: file.size,
      });
      for (let chunkIndex = job.uploadedFileChunks; chunkIndex < job.fileChunkCount; chunkIndex += 1) {
        const start = chunkIndex * UPLOAD_CHUNK_BYTES;
        const chunk = file.slice(start, Math.min(start + UPLOAD_CHUNK_BYTES, file.size));
        const chunkResponse = await fetch(
          `${endpoint}/${encodeURIComponent(job.id)}/chunks/${chunkIndex}`,
          { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk },
        );
        const chunkPayload: unknown = await chunkResponse.json();
        if (!chunkResponse.ok) throw new Error(errorMessage(chunkPayload, "Unable to save a workbook chunk."));
        setUploadProgress({
          jobId: job.id,
          uploadedBytes: Math.min((chunkIndex + 1) * UPLOAD_CHUNK_BYTES, file.size),
          totalBytes: file.size,
        });
      }
      const completeResponse = await fetch(`${endpoint}/${encodeURIComponent(job.id)}/complete`, { method: "POST" });
      const completePayload: unknown = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(errorMessage(completePayload, "Unable to finish saving this workbook."));
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadProgress(null);
      setNotice("Workbook securely saved to Import History.");
      setIsLoading(true);
      await loadJobs();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to save this workbook.");
      setIsLoading(true);
      await loadJobs();
    } finally {
      setIsUploading(false);
    }
  };

  const startAutomaticImport = (job: ImportJob) => {
    const reportHref = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/migration/import-history/${encodeURIComponent(job.id)}?autoStart=1`;
    router.push(reportHref);
  };

  const openJob = async (job: ImportJob) => {
    setError("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(job.id)}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to open this import."));
      if (typeof payload !== "object" || payload === null || !("job" in payload)
        || !("rows" in payload) || !Array.isArray(payload.rows)) {
        throw new Error("Import details response is invalid.");
      }
      setActiveJob(payload.job as ImportJob);
      setActiveRows(payload.rows as ImportRow[]);
      setSelectedValidationRowIds([]);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open this import.");
    }
  };

  const openCorrections = () => {
    if (!activeJob) return;
    const masterModule = modules.find((item) => item.key === activeJob.moduleKey);
    const corrections = activeRows
      .filter((row) => readRowErrors(row.payload).length > 0)
      .slice(0, MAX_VISIBLE_CORRECTION_ROWS)
      .map((row) => {
        const rowErrors = readRowValidationErrors(row.payload);
        const message = rowErrors.map((item) => item.message).join(" ");
        const fieldPaths = [...new Set(rowErrors.flatMap((item) => item.fieldPaths))];
        if (activeJob.moduleKey === "contact" && isRecord(row.payload)
          && isRecord(row.payload.input) && Array.isArray(row.payload.input.roles)
          && Array.isArray(row.payload.input.taxRegistrations)
          && Array.isArray(row.payload.input.addresses)
          && Array.isArray(row.payload.input.bankAccounts)) {
          return {
            ...createContactCorrectionRow(
            typeof row.payload.contactKey === "string" ? row.payload.contactKey : `ROW-${row.rowNumber}`,
            row.payload.input as unknown as ContactInput,
            message,
            fieldPaths,
            ),
            id: String(row.rowNumber),
          };
        }
        const fields = masterModule?.fields ?? [];
        const fieldErrors = new Map<string, string[]>();
        const linkedFieldPaths = new Map<string, string[]>();
        for (const field of fields) {
          const paths = field.type === "child-list"
            ? fieldPaths.filter((path: unknown): path is string =>
              typeof path === "string" && path.startsWith(`${field.key}.`),
            )
            : fieldPaths.includes(field.key) ? [field.key] : [];
          if (!paths.length) continue;
          linkedFieldPaths.set(field.key, paths);
          fieldErrors.set(field.key, rowErrors
            .filter((item) => item.fieldPaths.some((path: string) => paths.includes(path)))
            .map((item) => item.message));
        }
        const payloadFields = isRecord(row.payload) && isRecord(row.payload.fields) ? row.payload.fields : {};
        const correctionFields = fields
          .filter((field) => fieldErrors.has(field.key))
          .map(({ key, label, type }) => ({
            key,
            label: type === "child-list" ? `${label} (JSON rows)` : label,
            multiline: type === "child-list",
          }));
        const values = Object.fromEntries(correctionFields.map((field) => {
          if (field.multiline) {
            const children = isRecord(row.payload) && isRecord(row.payload.childRows)
              ? row.payload.childRows[field.key]
              : [];
            return [field.key, JSON.stringify(children ?? [], null, 2)];
          }
          const value = payloadFields[field.key];
          return [field.key, Array.isArray(value) ? value.join("; ") : String(value ?? "")];
        }));
        const errors = Object.fromEntries([...fieldErrors].map(([key, messages]) => [
          key,
          messages.map((item) => {
            const paths = linkedFieldPaths.get(key) ?? [];
            const causes = paths.filter((path) => rowErrors.some((errorItem) =>
              errorItem.message === item && errorItem.fieldPaths.includes(path),
            ));
            return causes.length ? `${item} (${causes.join(", ")})` : item;
          }),
        ]));
        if (correctionFields.length === 0) errors._row = [message];
        return {
          id: String(row.rowNumber),
          identity: readRowIdentity(row.payload, row.rowNumber),
          values,
          errors,
          fields: correctionFields,
        };
      });
    setCorrectionRows(corrections);
    setCorrectionEdits(Object.fromEntries(corrections.map((row) => [
      Number(row.id),
      { ...row.values },
    ])));
    setIsCorrectionOpen(true);
  };

  const updateCorrectionValue = (rowId: string, fieldKey: string, value: string) => {
    setCorrectionEdits((current) => ({
      ...current,
      [rowId]: { ...current[rowId], [fieldKey]: value },
    }));
  };

  const buildCorrectedPayload = (rowNumber: number) => {
    const sourceRow = activeRows.find((row) => row.rowNumber === rowNumber);
    if (!sourceRow || !isRecord(sourceRow.payload) || !activeJob) return null;
    const payload = { ...sourceRow.payload };
    delete payload.validationErrors;
    const edits = correctionEdits[rowNumber] ?? {};
    if (activeJob.moduleKey === "contact" && isRecord(payload.input)) {
      payload.input = createContactCorrectionDraft(payload.input as unknown as ContactInput, edits);
    } else {
      const fields = isRecord(payload.fields) ? { ...payload.fields } : {};
      const masterModule = modules.find((item) => item.key === activeJob.moduleKey);
      for (const [key, value] of Object.entries(edits)) {
        const definition = masterModule?.fields.find((field) => field.key === key);
        if (definition?.type === "child-list") {
          try {
            const parsed: unknown = JSON.parse(value);
            const children = isRecord(payload.childRows) ? { ...payload.childRows } : {};
            children[key] = parsed;
            payload.childRows = children;
          } catch {
            const children = isRecord(payload.childRows) ? { ...payload.childRows } : {};
            children[key] = value;
            payload.childRows = children;
          }
        } else if (definition?.multiple) {
          fields[key] = value.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
        } else if (definition?.type === "checkbox") {
          fields[key] = /^(true|yes|1)$/i.test(value)
            ? true
            : /^(false|no|0)$/i.test(value) ? false : value;
        } else if (["number", "percentage"].includes(definition?.type ?? "")) {
          fields[key] = value === "" ? null : Number(value);
        } else {
          fields[key] = value === "" ? null : value;
        }
      }
      payload.fields = fields;
    }
    return payload;
  };

  const saveCorrectionAndValidate = async (rowId: string) => {
    if (!activeJob) return;
    const rowNumber = Number(rowId);
    const payload = buildCorrectedPayload(rowNumber);
    if (!payload) return;
    setIsProcessing(true);
    setError("");
    setNotice("");
    try {
      const rowEndpoint = `${endpoint}/${encodeURIComponent(activeJob.id)}/rows/${rowNumber}`;
      const saveResponse = await fetch(rowEndpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const saveResult: unknown = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(errorMessage(saveResult, "Unable to save this row correction."));

      const validateResponse = await fetch(`${endpoint}/${encodeURIComponent(activeJob.id)}/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rowNumber }),
      });
      const validateResult: unknown = await validateResponse.json();
      if (!validateResponse.ok) throw new Error(errorMessage(validateResult, "Unable to validate this row."));
      await openJob(activeJob);
      setIsCorrectionOpen(false);
      setNotice("Row saved and revalidated. Review any remaining field errors.");
    } catch (correctionError) {
      setError(correctionError instanceof Error ? correctionError.message : "Unable to save this row correction.");
      setIsCorrectionOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveAllCorrectionsAndValidate = async () => {
    if (!activeJob || correctionRows.length === 0) return;
    setIsProcessing(true);
    setError("");
    setNotice("Saving and validating corrected rows...");
    try {
      for (const correction of correctionRows) {
        const rowNumber = Number(correction.id);
        const payload = buildCorrectedPayload(rowNumber);
        if (!payload) continue;
        const saveResponse = await fetch(
          `${endpoint}/${encodeURIComponent(activeJob.id)}/rows/${rowNumber}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ payload }),
          },
        );
        const saveResult: unknown = await saveResponse.json();
        if (!saveResponse.ok) throw new Error(errorMessage(saveResult, `Unable to save row ${rowNumber}.`));
        const validateResponse = await fetch(`${endpoint}/${encodeURIComponent(activeJob.id)}/validate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rowNumber }),
        });
        const validateResult: unknown = await validateResponse.json();
        if (!validateResponse.ok) throw new Error(errorMessage(validateResult, `Unable to validate row ${rowNumber}.`));
      }
      setIsCorrectionOpen(false);
      await openJob(activeJob);
      setNotice("Corrected rows were saved and revalidated. Review any remaining errors.");
    } catch (correctionError) {
      setError(correctionError instanceof Error ? correctionError.message : "Unable to save corrections.");
      setIsCorrectionOpen(false);
    } finally {
      setIsProcessing(false);
      await loadJobs();
    }
  };

  const validateImport = async () => {
    if (!activeJob || selectedValidationRowIds.length === 0) return;
    const selectedRowNumbers = selectedValidationRowIds.map(Number);
    setIsProcessing(true);
    setError("");
    setNotice(`Queueing validation for ${selectedRowNumbers.length} selected rows...`);
    try {
      const runEndpoint = `${endpoint}/${encodeURIComponent(activeJob.id)}/runs`;
      const response = await fetch(runEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operation: "VALIDATE", rowNumbers: selectedRowNumbers }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to queue this import validation."));
      if (!isRecord(payload) || !isBackgroundImportRun(payload.run)) {
          throw new Error("Validation run response is invalid.");
      }
      let run = payload.run;
      while (run.status === "QUEUED" || run.status === "RUNNING") {
          setNotice(`${run.operation}: ${run.progress.toLocaleString()} of ${run.total.toLocaleString()} processed.`);
          await new Promise((resolve) => window.setTimeout(resolve, 1_500));
          const statusResponse = await fetch(`${runEndpoint}/${encodeURIComponent(run.id)}/process`, { method: "POST" });
          const statusPayload: unknown = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(errorMessage(statusPayload, "Unable to process validation run."));
          if (!isRecord(statusPayload) || !isBackgroundImportRun(statusPayload.run)) {
            throw new Error("Validation progress response is invalid.");
          }
          run = statusPayload.run;
          if (run.status === "FAILED") {
            throw new Error(typeof run.error === "string" ? run.error : "The background validation failed.");
          }
      }
      if (run.status !== "COMPLETED") throw new Error("The background validation did not complete.");
      setSelectedValidationRowIds([]);
      await openJob(activeJob);
      setNotice(`${selectedRowNumbers.length.toLocaleString()} selected rows were validated. Review the updated row statuses before importing.`);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Unable to validate this import.");
    } finally {
      setIsProcessing(false);
      await loadJobs();
    }
  };

  const runImport = async () => {
    if (!activeJob) return;
    setIsProcessing(true);
    setError("");
    setNotice("Importing rows with server-side checkpoints. You can return here to resume after a refresh.");
    try {
      for (;;) {
        const response = await fetch(`${endpoint}/${encodeURIComponent(activeJob.id)}/commit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ batchSize: 25 }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, "Unable to import the next row."));
        if (!isRecord(payload) || !isRecord(payload.job) || !isRecord(payload.progress)) {
          throw new Error("Import progress response is invalid.");
        }
        const nextJob = payload.job as ImportJob;
        setActiveJob(nextJob);
        setNotice(`Import progress: ${nextJob.processedRows} of ${nextJob.totalRows} processed; ${nextJob.failedRows} need attention.`);
        if (payload.validationRequired === true || payload.row === null
          || nextJob.status === "COMPLETED" || nextJob.status === "STAGED") break;
      }
      await openJob(activeJob);
      setNotice("Import checkpoint saved. Review the final status and any failed rows.");
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Unable to continue this import.";
      await openJob(activeJob);
      setError(message);
    } finally {
      setIsProcessing(false);
      await loadJobs();
    }
  };

  const statusTone = (status: string) => {
    if (status === "COMPLETED") return "border-[var(--erp-success)] bg-[var(--erp-success-soft)] text-[var(--erp-success)]";
    if (status === "FAILED" || status === "PARTIAL") return "border-[var(--erp-danger)] bg-[var(--erp-surface)] text-[var(--erp-danger)]";
    if (status === "IMPORTING") return "border-[var(--erp-warning)] bg-[var(--erp-surface)] text-[var(--erp-warning)]";
    return "";
  };

  return (
    <Page as="div">
      <Section>
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--erp-text)]">Import History</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Securely staged master workbooks and import progress.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{jobs.length} import{jobs.length === 1 ? "" : "s"}</Badge>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsLoading(true);
                setError("");
                void loadJobs();
              }}
              disabled={isLoading}
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </header>

        <Card className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-1 h-5 w-5 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Upload a master workbook</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                Select a master module to download its template, fill it in, then upload it here. Uploading stores the workbook for 30 days and does not create master records.
              </p>
            </div>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(12rem,0.7fr)_minmax(16rem,1fr)] md:items-end lg:grid-cols-[minmax(12rem,0.7fr)_auto_minmax(16rem,1fr)_auto]">
            <Select
              label="Master module"
              value={selectedModule}
              onChange={(event) => {
                setSelectedModule(event.target.value);
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              options={modules.map(({ key, label }) => ({ value: key, label }))}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void downloadTemplate()}
              disabled={isDownloadingTemplate}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {isDownloadingTemplate ? "Preparing..." : "Download template"}
            </Button>
            <div className="min-w-0 space-y-1">
              <label htmlFor="master-import-file" className="block text-xs font-semibold uppercase tracking-wide text-[var(--erp-muted)]">
                Excel workbook
              </label>
              <Input
                ref={fileInputRef}
                id="master-import-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                }}
                className="block w-full min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-text)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--erp-brand-soft)] file:px-3 file:py-1.5 file:font-semibold file:text-[var(--erp-brand)]"
              />
            </div>
            <Button type="button" onClick={() => void handleUpload()} disabled={isUploading || !selectedFile}>
              <Upload aria-hidden="true" className="h-4 w-4" />
              {isUploading
                ? `Uploading${uploadProgress ? ` ${Math.floor(uploadProgress.uploadedBytes / uploadProgress.totalBytes * 100)}%` : "..."}`
                : "Save to Import History"}
            </Button>
          </div>
          {selectedFile ? <p className="text-xs text-[var(--erp-muted)]">Selected: {selectedFile.name}</p> : null}
          {isUploading && uploadProgress ? (
            <progress
              className="h-2 w-full accent-[var(--erp-brand)]"
              aria-label="Workbook upload progress"
              max={uploadProgress.totalBytes}
              value={uploadProgress.uploadedBytes}
            />
          ) : null}
        </Card>

        {notice ? <p className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-success)]" role="status">{notice}</p> : null}
        {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}

        <section className="min-w-0 space-y-3" aria-labelledby="import-history-list-heading">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h2 id="import-history-list-heading" className="text-base font-semibold text-[var(--erp-text)]">Uploaded workbooks</h2>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3 overflow-x-auto whitespace-nowrap">
              <span className="text-xs text-[var(--erp-muted)]">
                {filteredJobs.length} shown | {jobs.reduce((sum, job) => sum + job.totalRows, 0)} rows | {jobs.reduce((sum, job) => sum + job.failedRows, 0)} need attention
              </span>
              <Input
                aria-label="Search import history"
                placeholder="Search file, module, status"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-64 shrink-0"
              />
            </div>
          </div>

          <Table>
            <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase tracking-wide text-[var(--erp-muted)]">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Uploaded by</th>
                <th className="px-4 py-3">Uploaded at</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--erp-border)]">
              {filteredJobs.map((job) => {
                const matchedModule = modules.find((candidate) => candidate.key === job.moduleKey);
                return (
                  <tr key={job.id} className="align-middle">
                    <td className="max-w-80 px-4 py-3">
                      <Link
                        href={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/migration/import-history/${encodeURIComponent(job.id)}`}
                        className="block truncate font-medium text-[var(--erp-brand)] hover:underline focus-visible:underline"
                        title={`View imported records in ${job.uploadedFileName}`}
                      >
                        {job.uploadedFileName}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--erp-muted)]">{(job.uploadedFileSize / (1024 * 1024)).toFixed(2)} MiB</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-text)]">{matchedModule?.label ?? job.moduleKey}</td>
                    <td className="px-4 py-3 text-[var(--erp-muted)]">{job.uploaderDisplayName ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--erp-muted)]">{formatDateTime(job.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge className={statusTone(job.status)}>{STATUS_LABELS[job.status] ?? job.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--erp-muted)]">
                      {job.status === "UPLOADING"
                        ? `${job.uploadedFileChunks} / ${job.fileChunkCount} chunks saved`
                        : `${job.processedRows} / ${job.totalRows} | ${job.successfulRows} imported | ${job.failedRows} errors`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={deletingJobId !== null || ["UPLOADING", "IMPORTING", "COMPLETED", "FAILED"].includes(job.status)}
                          title={job.status === "UPLOADING"
                            ? "This upload is incomplete."
                            : job.status === "IMPORTING"
                                ? "This import is already running."
                                : job.status === "COMPLETED"
                                  ? "This import is already complete."
                                  : job.status === "FAILED"
                                    ? "This import stopped; open its report for manual recovery."
                                    : "Stage, plan, and import this workbook automatically"}
                          onClick={() => startAutomaticImport(job)}
                        >
                          {job.status === "UPLOADING"
                            ? "Upload incomplete"
                            : job.status === "IMPORTING"
                                ? "In progress"
                                : job.status === "COMPLETED"
                                  ? "Completed"
                                  : job.status === "FAILED"
                                    ? "Stopped"
                                    : "Start"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deletingJobId !== null || job.successfulRows > 0
                            || job.status === "IMPORTING" || job.status === "COMPLETED"}
                          title={job.successfulRows > 0 || job.status === "COMPLETED" || job.status === "IMPORTING"
                            ? "Imports with created master records cannot be deleted."
                            : "Delete this uploaded workbook and its staging data"}
                          onClick={() => {
                            setError("");
                            setDeleteTargetJob(job);
                          }}
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--erp-muted)]">
                    {jobs.length ? "No imports match your search." : "No workbooks have been uploaded yet."}
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--erp-muted)]">Loading import history...</td></tr>
              ) : null}
            </tbody>
          </Table>
        </section>
      </Section>
      <Modal
        open={activeJob !== null}
        onClose={() => setActiveJob(null)}
        closeOnBackdrop={false}
        ariaLabel="Import details"
        size="2xl"
      >
        {activeJob ? (
          <div className="space-y-4 p-6">
            <header>
              <h2 className="text-base font-semibold text-[var(--erp-text)]">{activeJob.uploadedFileName}</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                {modules.find((module) => module.key === activeJob.moduleKey)?.label ?? activeJob.moduleKey}
                {" | "}{STATUS_LABELS[activeJob.status] ?? activeJob.status}
                {" | "}{activeJob.processedRows} of {activeJob.totalRows} processed
                {" | "}{activeJob.failedRows} errors
              </p>
            </header>
            {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
            {notice ? <p className="rounded-xl border border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] px-3 py-2 text-sm text-[var(--erp-brand)]" role="status">{notice}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {activeRows.some((row) => readRowErrors(row.payload).length > 0) ? (
                <Button type="button" variant="secondary" onClick={openCorrections} disabled={isProcessing}>
                  Correct invalid rows
                </Button>
              ) : null}
              {["STAGED", "VALIDATED", "PARTIAL"].includes(activeJob.status) ? (
                <Button
                  type="button"
                  onClick={() => void validateImport()}
                  disabled={isProcessing || selectedValidationRowIds.length === 0}
                >
                  {isProcessing ? "Validating..." : `Validate selected (${selectedValidationRowIds.length})`}
                </Button>
              ) : null}
              {activeJob.status === "VALIDATED" ? (
                <Button type="button" onClick={() => void runImport()} disabled={isProcessing}>
                  {isProcessing ? "Importing..." : "Start Import"}
                </Button>
              ) : null}
              {activeJob.status === "IMPORTING" || activeJob.status === "PARTIAL" ? (
                <Button type="button" onClick={() => void runImport()} disabled={isProcessing}>
                  {isProcessing ? "Importing..." : activeJob.status === "PARTIAL" ? "Resume import" : "Continue import"}
                </Button>
              ) : null}
            </div>
            <div className="max-h-[min(60dvh,40rem)] space-y-3 overflow-y-auto">
              {activeRows.map((row) => {
                const validationErrors = readRowValidationErrors(row.payload);
                const errors = validationErrors.map((item) => item.message);
                const canSelectForValidation = row.status === "STAGED" || row.status === "CORRECTED";
                return (
                  <section key={row.rowNumber} className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        {canSelectForValidation ? (
                          <Checkbox
                            aria-label={`Select workbook row ${row.rowNumber} for validation`}
                            checked={selectedValidationRowIds.includes(String(row.rowNumber))}
                            disabled={isProcessing}
                            onChange={(event) => setSelectedValidationRowIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, String(row.rowNumber)])]
                                : current.filter((id) => id !== String(row.rowNumber)),
                            )}
                          />
                        ) : null}
                        <h3 className="text-sm font-semibold text-[var(--erp-text)]">{readRowIdentity(row.payload, row.rowNumber)}</h3>
                      </div>
                      <Badge className={errors.length ? "border-[var(--erp-danger)] bg-[var(--erp-surface)] text-[var(--erp-danger)]" : ""}>
                        {row.status}
                      </Badge>
                    </div>
                    {errors.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--erp-danger)]" role="alert">
                        {validationErrors.map((item, index) => (
                          <li key={`${row.rowNumber}-${index}`}>
                            {item.message}
                            {item.fieldPaths.length ? ` (${item.fieldPaths.join(", ")})` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--erp-muted)]">
                        {row.status === "IMPORTED" ? "Imported successfully." : "No validation errors recorded for this row."}
                      </p>
                    )}
                  </section>
                );
              })}
              {!activeRows.length ? (
                <p className="rounded-xl border border-[var(--erp-border)] p-6 text-center text-sm text-[var(--erp-muted)]">
                  No staged rows are available for this import.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setActiveJob(null)} disabled={isProcessing}>Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal
        open={deleteTargetJob !== null}
        onClose={() => {
          if (deletingJobId === null) setDeleteTargetJob(null);
        }}
        closeOnBackdrop={false}
        ariaLabel="Confirm uploaded workbook deletion"
        size="md"
      >
        {deleteTargetJob ? (
          <div className="space-y-4 p-6">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Delete uploaded workbook?</h2>
            <p className="text-sm text-[var(--erp-muted)]">
              This permanently removes <span className="font-semibold">{deleteTargetJob.uploadedFileName}</span>,
              its staged rows, and saved upload chunks from Import History. It does not delete any master records.
              Workbooks with imported records cannot be deleted.
            </p>
            {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteTargetJob(null)}
                disabled={deletingJobId !== null}
              >
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={() => void deleteJob()} disabled={deletingJobId !== null}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                {deletingJobId === deleteTargetJob.id ? "Deleting..." : "Delete workbook"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <MasterImportCorrection
        open={isCorrectionOpen}
        title="Correct invalid import rows"
        description={`Only fields linked to each error are editable. The first ${correctionRows.length} invalid rows are shown; save and validate them to reveal the next batch.`}
        rows={correctionRows}
        fields={[]}
        isPending={isProcessing}
        onChange={updateCorrectionValue}
        onValidateRow={(rowId) => void saveCorrectionAndValidate(rowId)}
        onClose={() => setIsCorrectionOpen(false)}
        onRetry={() => void saveAllCorrectionsAndValidate()}
        retryLabel="Save and validate all shown"
      />
    </Page>
  );
}
