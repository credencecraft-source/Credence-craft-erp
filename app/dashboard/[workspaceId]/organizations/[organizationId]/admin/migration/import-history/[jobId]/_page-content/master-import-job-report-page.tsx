"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";
import {
  MasterImportCorrection,
  type MasterImportCorrectionRow,
} from "@/components/master-data/master-import-correction";
import {
  createContactCorrectionDraft,
  createContactCorrectionRow,
} from "@/lib/master-data/contact-import-corrections";
import { CONTACT_WORKBOOK_COLUMNS } from "@/lib/master-data/contact-records-workbook-columns";
import type { ContactInput } from "@/lib/services/master-data/contact-master-validation";
import {
  contactTemplateFieldName,
  getImportReportFields,
  humanizeImportFieldName,
  isImportReportError,
  type ImportReportField,
} from "@/lib/master-data/master-import-report-format";

const REPORT_PAGE_SIZE = 100;

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
  stagedAt: string | null;
  validatedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
};

type ImportRow = {
  rowNumber: number;
  status: string;
  checkpoint: string | null;
  payload: unknown;
  updatedAt: string;
};

type ImportModule = { key: string; label: string; fields: ImportReportField[] };
type ReportRow = Record<string, string> & {
  id: string;
  rowNumber: string;
  status: string;
  identity: string;
  validationErrors: string;
};

const BASE_FIELDS = [
  { key: "rowNumber", label: "Workbook row" },
  { key: "status", label: "Row status" },
  { key: "validationErrors", label: "Validation errors" },
];

type ReportTab = "staged" | "validated" | "errors" | "created" | "planned";
type ReportRowCounts = { staged: number; validated: number; errors: number; created: number };
type ImportPlan = {
  planNumber: number;
  recordCount: number;
  validatedCount: number;
  importedCount: number;
  validatedRowNumbers: number[];
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReportRowCounts(value: unknown): value is ReportRowCounts {
  return isRecord(value)
    && ["staged", "validated", "errors", "created"].every((key) =>
      typeof value[key] === "number" && Number.isSafeInteger(value[key]) && value[key] >= 0);
}

function isImportPlan(value: unknown): value is ImportPlan {
  return isRecord(value)
    && typeof value.planNumber === "number"
    && typeof value.recordCount === "number"
    && typeof value.validatedCount === "number"
    && typeof value.importedCount === "number"
    && Array.isArray(value.validatedRowNumbers)
    && value.validatedRowNumbers.every((rowNumber) => typeof rowNumber === "number");
}

function readError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
}

function readValidationErrors(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.validationErrors)) return "";
  return payload.validationErrors.map((error) => {
    if (typeof error === "string") return error;
    if (isRecord(error) && typeof error.message === "string") {
      const paths = Array.isArray(error.fieldPaths)
        ? error.fieldPaths.filter((path): path is string => typeof path === "string")
        : [];
      return paths.length
        ? `${error.message} (${paths.map((path) => payload.input
          ? contactTemplateFieldName(path)
          : humanizeImportFieldName(path)).join(", ")})`
        : error.message;
    }
    return "";
  }).filter(Boolean).join(" | ");
}

function readRowValidationErrors(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.validationErrors)) return [];
  return payload.validationErrors.flatMap((error) => {
    if (!isRecord(error) || typeof error.message !== "string") return [];
    const fieldPaths = Array.isArray(error.fieldPaths)
      ? error.fieldPaths.filter((path): path is string => typeof path === "string")
      : [];
    return [{ message: error.message, fieldPaths }];
  });
}

function recordIdentity(payload: unknown, rowNumber: number) {
  if (!isRecord(payload)) return `Row ${rowNumber}`;
  const input = isRecord(payload.input) ? payload.input : {};
  const fields = isRecord(payload.fields) ? payload.fields : {};
  for (const key of ["displayName", "legalName", "name", "description", "code", "contactKey"]) {
    const value = payload[key];
    const nestedValue = input[key] ?? fields[key];
    if (typeof nestedValue === "string" && nestedValue.trim()) return nestedValue;
    if (typeof value === "string" && value.trim()) return value;
  }
  const firstText = Object.values(input).find((value) => typeof value === "string" && value.trim())
    ?? Object.values(fields).find((value) => typeof value === "string" && value.trim());
  return typeof firstText === "string" ? firstText : `Row ${rowNumber}`;
}

function statusTone(status: string) {
  if (status === "COMPLETED" || status === "IMPORTED" || status === "VALIDATED") {
    return "border-[var(--erp-success)] bg-[var(--erp-success-soft)] text-[var(--erp-success)]";
  }
  if (status === "INVALID" || status === "FAILED" || status === "PARTIAL") {
    return "border-[var(--erp-danger)] bg-[var(--erp-surface)] text-[var(--erp-danger)]";
  }
  return "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]";
}

export default function MasterImportJobReportPage({
  workspaceId,
  organizationId,
  jobId,
  modules,
}: {
  workspaceId: string;
  organizationId: string;
  jobId: string;
  modules: ImportModule[];
}) {
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/master-imports/${encodeURIComponent(jobId)}`;
  const historyHref = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/migration/import-history`;
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [plans, setPlans] = useState<ImportPlan[]>([]);
  const [planCount, setPlanCount] = useState(0);
  const [selectedValidationRowIds, setSelectedValidationRowIds] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);
  const [correctionRow, setCorrectionRow] = useState<MasterImportCorrectionRow | null>(null);
  const [correctionValues, setCorrectionValues] = useState<Record<string, string>>({});
  const [correctionError, setCorrectionError] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>("staged");
  const [reportPage, setReportPage] = useState(0);
  const [rowCounts, setRowCounts] = useState<ReportRowCounts>({
    staged: 0,
    validated: 0,
    errors: 0,
    created: 0,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeOperation, setActiveOperation] = useState<"stage" | "validate" | "commit" | null>(null);
  const [activePlanNumber, setActivePlanNumber] = useState<number | null>(null);

  const loadJob = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        limit: String(REPORT_PAGE_SIZE),
        offset: String(reportPage * REPORT_PAGE_SIZE),
        tab: activeReportTab,
      });
      const response = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, "Unable to load this import report."));
      if (!isRecord(payload) || !isRecord(payload.job) || !Array.isArray(payload.rows)
        || !Array.isArray(payload.plans) || !payload.plans.every(isImportPlan)
        || typeof payload.planCount !== "number"
        || !isReportRowCounts(payload.rowCounts)) {
        throw new Error("Import report response is invalid.");
      }
      setJob(payload.job as ImportJob);
      setRows(payload.rows as ImportRow[]);
      setPlans(payload.plans);
      setPlanCount(payload.planCount);
      setRowCounts(payload.rowCounts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this import report.");
    } finally {
      setIsLoading(false);
    }
  }, [activeReportTab, endpoint, reportPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadJob(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJob]);

  const currentModule = modules.find((module) => module.key === job?.moduleKey);
  const reportRows = useMemo<ReportRow[]>(() => rows.map((row): ReportRow => {
    const payload = isRecord(row.payload) ? row.payload : { value: row.payload };
    const workbookFields = getImportReportFields(payload, currentModule?.fields);
    const validationErrors = readValidationErrors(payload);
    return {
      ...workbookFields,
      id: String(row.rowNumber),
      rowNumber: String(row.rowNumber),
      status: row.status,
      identity: recordIdentity(payload, row.rowNumber),
      validationErrors,
    };
  }), [currentModule?.fields, rows]);

  const reportFields = useMemo(() => {
    const workbookFields = currentModule?.key === "contact"
      ? CONTACT_WORKBOOK_COLUMNS.map((label) => ({ key: label, label }))
      : [
          ...(currentModule?.fields ?? []),
          { key: "Master Code", label: "Master Code" },
          { key: "Description", label: "Description" },
        ];
    return [
      ...BASE_FIELDS,
      ...workbookFields,
    ];
  }, [currentModule]);

  const errorRows = useMemo(
    () => reportRows.filter((row) => isImportReportError(row.status, row.validationErrors)),
    [reportRows],
  );
  const validatedRows = useMemo(
    () => reportRows.filter((row) => row.status === "VALIDATED"),
    [reportRows],
  );
  const createdRows = useMemo(
    () => reportRows.filter((row) => row.status === "IMPORTED"),
    [reportRows],
  );
  const stagedRows = useMemo(
    () => reportRows.filter((row) => ![
      "VALIDATED",
      "IMPORTED",
      "INVALID",
      "FAILED",
    ].includes(row.status)),
    [reportRows],
  );
  const activeRows = activeReportTab === "errors"
    ? errorRows
    : activeReportTab === "created"
      ? createdRows
      : activeReportTab === "validated"       ? validatedRows : stagedRows;
  const activeRowCount = activeReportTab === "planned" ? planCount : rowCounts[activeReportTab];
  const selectedValidationRowNumbers = selectedValidationRowIds.map(Number);
  const activeSelectedRowIds = activeReportTab === "staged" ? selectedValidationRowIds : [];
  const nextPageOffset = reportPage * REPORT_PAGE_SIZE
    + (activeReportTab === "planned" ? plans.length : rows.length);

  const visibleReportFields = visibleFields.length
    ? visibleFields.filter((key) => reportFields.some((field) => field.key === key))
    : reportFields.map((field) => field.key);

  const runOperation = async (operation: "stage" | "validate", selectedRowNumbers: number[] = []) => {
    if (!job) return;
    if (operation === "validate" && selectedRowNumbers.length === 0) {
      setError("Select at least one staged row to validate.");
      return;
    }
    setActiveOperation(operation);
    setIsProcessing(true);
    setError("");
    setNotice(operation === "stage" ? "Staging workbook rows on the server..." : "Validating selected rows...");
    try {
      if (operation === "stage") {
        const response = await fetch(`${endpoint}/stage`, { method: "POST" });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(readError(payload, "Unable to stage this workbook."));
        setNotice("Workbook rows are saved in server staging. Review validation results before starting the import.");
      } else if (operation === "validate") {
        for (let index = 0; index < selectedRowNumbers.length; index += REPORT_PAGE_SIZE) {
          const response = await fetch(`${endpoint}/validate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rowNumbers: selectedRowNumbers.slice(index, index + REPORT_PAGE_SIZE) }),
          });
          const payload: unknown = await response.json();
          if (!response.ok) throw new Error(readError(payload, "Unable to validate this import."));
          if (!isRecord(payload) || !isRecord(payload.job)) {
            throw new Error("Validation progress response is invalid.");
          }
          setJob(payload.job as ImportJob);
          const validatedRowIds = selectedRowNumbers
            .slice(index, index + REPORT_PAGE_SIZE)
            .map(String);
          setSelectedValidationRowIds((current) =>
            current.filter((rowId) => !validatedRowIds.includes(rowId)),
          );
        }
        setSelectedValidationRowIds([]);
        setActiveReportTab("validated");
        setReportPage(0);
        setNotice("Selected rows were validated. Review the Validated and Errors tabs before importing.");
      }
      if (operation !== "validate") await loadJob();
    } catch (operationError) {
      const message = operationError instanceof Error
        ? operationError.message
        : "Unable to complete this import action.";
      await loadJob();
      setError(message);
    } finally {
      setIsProcessing(false);
      setActiveOperation(null);
    }
  };

  const startImportPlan = async (plan: ImportPlan) => {
    if (!job || plan.validatedRowNumbers.length === 0 || plan.validatedRowNumbers.length > 100) return;
    setActiveOperation("commit");
    setActivePlanNumber(plan.planNumber);
    setIsProcessing(true);
    setError("");
    setNotice(`Importing plan ${plan.planNumber} (${plan.validatedRowNumbers.length} validated records)...`);
    try {
      let hasMoreRows = true;
      for (let batch = 0; batch < 4 && hasMoreRows; batch += 1) {
        const response = await fetch(`${endpoint}/plans/${plan.planNumber}/commit`, {
          method: "POST",
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(readError(payload, `Unable to import plan ${plan.planNumber}.`));
        if (!isRecord(payload) || !isRecord(payload.job)
          || !isRecord(payload.planProgress) || typeof payload.planProgress.hasMore !== "boolean") {
          throw new Error("Plan import progress response is invalid.");
        }
        setJob(payload.job as ImportJob);
        hasMoreRows = payload.planProgress.hasMore;
      }
      if (hasMoreRows) throw new Error("Plan import did not finish within the expected number of batches.");
      await loadJob();
      setNotice(`Plan ${plan.planNumber} import finished. Review Errors for rows that need correction.`);
    } catch (planError) {
      await loadJob();
      setError(planError instanceof Error ? planError.message : `Unable to import plan ${plan.planNumber}.`);
    } finally {
      setIsProcessing(false);
      setActiveOperation(null);
      setActivePlanNumber(null);
    }
  };

  const createImportPlans = async () => {
    if (!job) return;
    setActiveOperation("commit");
    setIsProcessing(true);
    setError("");
    setNotice("Creating separate import plans from validated records...");
    try {
      const response = await fetch(`${endpoint}/plans`, { method: "POST" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, "Unable to create import plans."));
      if (!isRecord(payload) || typeof payload.planCount !== "number"
        || typeof payload.plannedRowCount !== "number") {
        throw new Error("Import plan response is invalid.");
      }
      setActiveReportTab("planned");
      setReportPage(0);
      setNotice(payload.planCount === 0
        ? "There are no new validated records to plan."
        : `Created ${payload.planCount} separate plan${payload.planCount === 1 ? "" : "s"} for ${payload.plannedRowCount} validated records. Each plan contains at most 100 records.`);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "Unable to create import plans.");
    } finally {
      setIsProcessing(false);
      setActiveOperation(null);
    }
  };

  const openErrorCorrection = (rowNumber: number) => {
    const sourceRow = rows.find((row) => row.rowNumber === rowNumber);
    if (!sourceRow || !isRecord(sourceRow.payload)) return;
    const payload = sourceRow.payload;
    const rowErrors = readRowValidationErrors(payload);
    const messages = [...new Set(rowErrors.map((item) => item.message))];
    const fieldPaths = [...new Set(rowErrors.flatMap((item) => item.fieldPaths))];
    const message = messages.join(" ");
    let nextCorrection: MasterImportCorrectionRow;

    if (currentModule?.key === "contact" && isRecord(payload.input)
      && Array.isArray(payload.input.roles)
      && Array.isArray(payload.input.taxRegistrations)
      && Array.isArray(payload.input.addresses)
      && Array.isArray(payload.input.bankAccounts)) {
      nextCorrection = {
        ...createContactCorrectionRow(
          typeof payload.contactKey === "string" ? payload.contactKey : `ROW-${rowNumber}`,
          payload.input as unknown as ContactInput,
          message || "This row needs correction.",
          fieldPaths,
        ),
        id: String(rowNumber),
      };
    } else {
      const fields = currentModule?.fields ?? [];
      const fieldErrors = new Map<string, string[]>();
      const linkedPaths = new Map<string, string[]>();
      const hasFieldPaths = fieldPaths.length > 0;
      for (const field of fields) {
        const paths = field.type === "child-list"
          ? fieldPaths.filter((path) => path.startsWith(`${field.key}.`))
          : fieldPaths.includes(field.key) ? [field.key] : [];
        if (hasFieldPaths && !paths.length) continue;
        linkedPaths.set(field.key, paths);
        fieldErrors.set(field.key, rowErrors
          .filter((item) => !hasFieldPaths || item.fieldPaths.some((path) => paths.includes(path)))
          .map((item) => item.message));
      }
      const payloadFields = isRecord(payload.fields) ? payload.fields : {};
      const childRows = isRecord(payload.childRows) ? payload.childRows : {};
      const correctionFields = fields
        .filter((field) => fieldErrors.has(field.key))
        .map((field) => ({
          key: field.key,
          label: field.type === "child-list" ? `${field.label} (JSON rows)` : field.label,
          multiline: field.type === "child-list",
        }));
      const values = Object.fromEntries(correctionFields.map((field) => [
        field.key,
        field.multiline
          ? JSON.stringify(childRows[field.key] ?? [], null, 2)
          : Array.isArray(payloadFields[field.key])
            ? (payloadFields[field.key] as unknown[]).join("; ")
            : String(payloadFields[field.key] ?? ""),
      ]));
      const errors = Object.fromEntries([...fieldErrors].map(([key, fieldMessages]) => {
        const paths = linkedPaths.get(key) ?? [];
        const details = fieldMessages.map((fieldMessage) => {
          const relatedPaths = paths.filter((path) => rowErrors.some((item) =>
            item.message === fieldMessage && item.fieldPaths.includes(path),
          ));
          return relatedPaths.length
            ? `${fieldMessage} (${relatedPaths.map(humanizeImportFieldName).join(", ")})`
            : fieldMessage;
        });
        return [key, details];
      }));
      if (!correctionFields.length) errors._row = [message || "This row needs correction."];
      nextCorrection = {
        id: String(rowNumber),
        identity: `${recordIdentity(payload, rowNumber)} - spreadsheet row ${rowNumber}`,
        values,
        errors,
        fields: correctionFields,
      };
    }

    setCorrectionError("");
    setCorrectionValues({ ...nextCorrection.values });
    setCorrectionRow(nextCorrection);
  };

  const saveAndValidateCorrection = async (rowId: string) => {
    const sourceRow = rows.find((row) => String(row.rowNumber) === rowId);
    if (!sourceRow || !isRecord(sourceRow.payload) || !job) return;
    setIsSavingCorrection(true);
    setCorrectionError("");
    try {
      const payload = { ...sourceRow.payload };
      delete payload.validationErrors;
      const edits = correctionValues;

      if (job.moduleKey === "contact" && isRecord(payload.input)) {
        payload.input = createContactCorrectionDraft(payload.input as unknown as ContactInput, edits);
      } else {
        const fields = isRecord(payload.fields) ? { ...payload.fields } : {};
        const childRows = isRecord(payload.childRows) ? { ...payload.childRows } : {};
        for (const [key, value] of Object.entries(edits)) {
          const definition = currentModule?.fields.find((field) => field.key === key);
          if (definition?.type === "child-list") {
            let parsed: unknown;
            try {
              parsed = JSON.parse(value);
            } catch {
              throw new Error(`${definition.label} must be valid JSON.`);
            }
            if (!Array.isArray(parsed)) throw new Error(`${definition.label} must be a JSON array.`);
            childRows[key] = parsed;
          } else if (definition?.multiple) {
            fields[key] = value.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
          } else if (definition?.type === "checkbox") {
            fields[key] = /^(true|yes|1)$/i.test(value)
              ? true
              : /^(false|no|0)$/i.test(value) ? false : value;
          } else if (["number", "percentage"].includes(definition?.type ?? "")) {
            const number = Number(value);
            fields[key] = value === "" ? null : Number.isFinite(number) ? number : value;
          } else {
            fields[key] = value === "" ? null : value;
          }
        }
        payload.fields = fields;
        payload.childRows = childRows;
      }

      const rowEndpoint = `${endpoint}/rows/${sourceRow.rowNumber}`;
      const saveResponse = await fetch(rowEndpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const saveResult: unknown = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(readError(saveResult, "Unable to save this row correction."));

      const validateResponse = await fetch(`${endpoint}/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rowNumber: sourceRow.rowNumber }),
      });
      const validateResult: unknown = await validateResponse.json();
      if (!validateResponse.ok) throw new Error(readError(validateResult, "Unable to validate this corrected row."));

      setCorrectionRow(null);
      setNotice("Correction saved and row revalidated.");
      await loadJob();
    } catch (saveError) {
      setCorrectionError(saveError instanceof Error ? saveError.message : "Unable to save this correction.");
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const moduleLabel = currentModule?.label ?? job?.moduleKey ?? "Master data";
  const canStage = job?.status === "UPLOADED";
  return (
    <Page>
      <Section>
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={historyHref} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--erp-brand)] hover:underline">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Import History
            </Link>
            <h1 className="truncate text-xl font-semibold text-[var(--erp-text)]">
              {job?.uploadedFileName ?? "Import workbook report"}
            </h1>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {moduleLabel} · {job ? `${job.processedRows} of ${job.totalRows} processed · ${job.successfulRows} imported · ${job.failedRows} need attention` : "Review all staged workbook records"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {job ? <Badge className={statusTone(job.status)}>{STATUS_LABELS[job.status] ?? job.status}</Badge> : null}
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadJob()} disabled={isLoading || isProcessing}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Refresh
            </Button>
            {canStage ? (
              <Button type="button" onClick={() => void runOperation("stage")} disabled={isProcessing}>
                {isProcessing ? "Staging..." : "Stage workbook"}
              </Button>
            ) : null}
            {activeReportTab === "validated" ? (
              <Button
                type="button"
                onClick={() => void createImportPlans()}
                disabled={isProcessing || rowCounts.validated === 0}
              >
                {isProcessing && activeOperation === "commit" ? "Creating plans..." : "Plan and import"}
              </Button>
            ) : null}
            {activeReportTab === "staged" ? (
              <Button
                type="button"
                onClick={() => void runOperation("validate", selectedValidationRowNumbers)}
                disabled={isProcessing || selectedValidationRowNumbers.length === 0}
              >
                {isProcessing && activeOperation === "validate"
                  ? "Validating..."
                  : `Validate selected (${selectedValidationRowNumbers.length})`}
              </Button>
            ) : null}
          </div>
        </header>

        {notice ? <p className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-success)]" role="status">{notice}</p> : null}
        {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
        {job?.status === "UPLOADING" ? (
          <Card className="p-6 text-sm text-[var(--erp-muted)]">
            Upload is incomplete ({job.uploadedFileChunks} of {job.fileChunkCount} chunks saved). Resume it from Import History to continue.
          </Card>
        ) : null}
        {job?.status === "UPLOADED" ? (
          <Card className="p-6 text-sm text-[var(--erp-muted)]">
            The workbook is saved on the server. Stage it to parse all rows into temporary import records.
          </Card>
        ) : null}
        {activeReportTab === "staged" ? (
          <p className="rounded-xl border border-[var(--erp-info)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-info)]" role="status">
        Select staged rows and choose Validate selected. Successfully validated rows move to Validated; only rows in that tab can be selected for import.
          </p>
        ) : null}
        <Card className="min-w-0 space-y-4 p-4 sm:p-6">
          <Tabs
            ariaLabel="Import record status"
            value={activeReportTab}
            onChange={(tab) => {
              setActiveReportTab(tab);
              setReportPage(0);
            }}
            tabs={[
              { value: "staged", label: `Staged (${rowCounts.staged})` },
              { value: "validated", label: `Validated (${rowCounts.validated})` },
              { value: "planned", label: `Planned & Import (${planCount})` },
              { value: "errors", label: `Errors (${rowCounts.errors})` },
              { value: "created", label: `Created (${rowCounts.created})` },
            ]}
          />
          {activeReportTab === "planned" ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--erp-muted)]">
                Each planning action creates separate plans from validated records that are not already planned. Plans contain at most 100 records and import independently.
                Only validated and imported rows appear here. Any row with a validation or import error appears in Errors.
              </p>
              {plans.map((plan) => (
                <Card key={plan.planNumber} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold text-[var(--erp-text)]">Plan {plan.planNumber}</h3>
                    <p className="text-sm text-[var(--erp-muted)]">
                      {plan.recordCount} records · {plan.validatedCount} ready · {plan.importedCount} imported
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => void startImportPlan(plan)}
                    disabled={isProcessing || plan.validatedCount === 0}
                  >
                    {activePlanNumber === plan.planNumber ? "Importing..." : "Start import"}
                  </Button>
                </Card>
              ))}
              {!isLoading && plans.length === 0 ? (
                <p className="rounded-xl border border-[var(--erp-border)] p-6 text-center text-sm text-[var(--erp-muted)]">
                  No validated records are planned yet. Validate records first, then choose Plan and import.
                </p>
              ) : null}
            </div>
          ) : (
          <ReportGrid
            title={activeReportTab === "errors"
              ? "Rows with errors"
              : activeReportTab === "created"
                ? "Created master records"
                : activeReportTab === "validated"
                  ? "Validated workbook records"
                  : "Staged workbook records"}
            records={activeRows}
            fields={reportFields}
            visibleFields={visibleReportFields}
            onVisibleFieldsChange={(fields) => setVisibleFields(fields as string[])}
            storageKey={`master-import-report-${organizationId}-${jobId}-${activeReportTab}`}
            rowIdSelector={(row) => row.id}
            selectedIds={activeSelectedRowIds}
            selectable={activeReportTab === "staged"}
            rowSelectable={(row) => !isProcessing && (
              activeReportTab === "staged"
                && (row.status === "STAGED" || row.status === "CORRECTED")
            )}
            onToggleSelectAll={(checked, ids) => setSelectedValidationRowIds((current) => {
              if (checked) return [...new Set([...current, ...ids])];
              return current.filter((id) => !ids.includes(id));
            })}
            onToggleRowSelection={(rowId, checked) => setSelectedValidationRowIds((current) =>
              checked
                ? [...new Set([...current, rowId])]
                : current.filter((id) => id !== rowId),
            )}
            onRowClick={(rowId) => {
              const reportRow = reportRows.find((row) => row.id === rowId);
              if (!reportRow) return;
              if (activeReportTab === "errors") openErrorCorrection(Number(rowId));
              else setSelectedRow(reportRow);
            }}
            getSearchValue={(fieldKey, row) => row[fieldKey] ?? ""}
            renderCell={(fieldKey, row) => {
              const value = row[fieldKey] ?? "";
              return fieldKey === "status"
                ? <Badge className={statusTone(value)}>{value}</Badge>
                : <span className="whitespace-pre-line" title={value}>{value}</span>;
            }}
            wrapCells
            isLoading={isLoading}
            emptyMessage={error
              ? "Unable to load workbook records."
              : activeReportTab === "errors"
                ? "No rows with validation or import errors."
                : activeReportTab === "created"
                  ? "No master records have been created from this workbook yet."
                  : activeReportTab === "validated"
                    ? "No validated rows are available yet."
                    : "No staged workbook rows are available yet."}
          />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--erp-muted)]">
            <span>
              {activeRowCount === 0
              ? activeReportTab === "planned" ? "No plans" : "No records"
              : `Showing ${reportPage * REPORT_PAGE_SIZE + 1}-${nextPageOffset} of ${activeRowCount} ${activeReportTab === "planned" ? "plans" : "records"}.`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReportPage((page) => Math.max(0, page - 1))}
                disabled={reportPage === 0 || isLoading}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReportPage((page) => page + 1)}
                disabled={nextPageOffset >= activeRowCount || isLoading}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      <Modal
        open={selectedRow !== null}
        onClose={() => setSelectedRow(null)}
        closeOnBackdrop={false}
        ariaLabel="Imported record details"
        size="2xl"
      >
        {selectedRow ? (
          <div className="space-y-4 p-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--erp-text)]">{selectedRow.identity}</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">Workbook row {selectedRow.rowNumber}</p>
              </div>
              <Badge className={statusTone(selectedRow.status)}>{selectedRow.status}</Badge>
            </header>
            {selectedRow.validationErrors ? (
              <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-danger)]" role="alert">
                {selectedRow.validationErrors}
              </p>
            ) : null}
            <dl className="grid max-h-[min(60dvh,40rem)] grid-cols-1 gap-3 overflow-auto rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4 sm:grid-cols-2">
              {reportFields
                .filter((field) => !["id", "rowNumber", "status", "identity", "validationErrors"].includes(String(field.key)))
                .map((field) => (
                  <div key={String(field.key)} className="min-w-0 space-y-1">
                    <dt className="text-xs font-semibold text-[var(--erp-muted)]">{field.label}</dt>
                    <dd className="whitespace-pre-line break-words text-sm text-[var(--erp-text)]">
                      {selectedRow[String(field.key)] || "—"}
                    </dd>
                  </div>
                ))}
            </dl>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setSelectedRow(null)}>Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <MasterImportCorrection
        open={correctionRow !== null}
        title="Correct import row"
        description="Correct the indicated fields, or review editable fields when the error does not identify one. Save and validate before retrying import."
        rows={correctionRow ? [correctionRow] : []}
        fields={[]}
        isPending={isSavingCorrection}
        errorMessage={correctionError}
        showValidateRowAction={false}
        onChange={(_rowId, fieldKey, value) => {
          setCorrectionValues((current) => ({ ...current, [fieldKey]: value }));
        }}
        onValidateRow={() => undefined}
        onClose={() => {
          if (!isSavingCorrection) {
            setCorrectionRow(null);
            setCorrectionError("");
          }
        }}
        onRetry={() => {
          if (correctionRow) void saveAndValidateCorrection(correctionRow.id);
        }}
        retryLabel="Save and validate"
      />
    </Page>
  );
}
