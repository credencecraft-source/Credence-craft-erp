"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  errorCount: number;
};
type ImportPlanCounts = Pick<
  ImportPlan,
  "recordCount" | "validatedCount" | "importedCount" | "errorCount"
>;

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
    && typeof value.errorCount === "number";
}

function isImportRow(value: unknown): value is ImportRow {
  return isRecord(value)
    && Number.isSafeInteger(value.rowNumber)
    && typeof value.status === "string"
    && typeof value.updatedAt === "string";
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

function formatEstimatedTime(remainingRows: number) {
  const remainingSeconds = Math.max(0, remainingRows) * 5;
  if (remainingSeconds < 60) return `About ${remainingSeconds} seconds`;
  const remainingMinutes = Math.ceil(remainingSeconds / 60);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return hours > 0
    ? `About ${hours} hr ${minutes} min`
    : `About ${remainingMinutes} min`;
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
  const automaticFlowStartedForJob = useRef<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [plans, setPlans] = useState<ImportPlan[]>([]);
  const [planProgressByNumber, setPlanProgressByNumber] = useState<Record<number, ImportPlanCounts>>({});
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
  const [activeOperation, setActiveOperation] = useState<"stage" | "validate" | "auto-plan" | "commit" | null>(null);
  const [activePlanNumber, setActivePlanNumber] = useState<number | null>(null);
  const [automaticPhase, setAutomaticPhase] = useState<
    "idle" | "staging" | "planning" | "importing" | "complete" | "attention"
  >("idle");

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
      setPlanProgressByNumber({});
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
    setNotice(operation === "stage" ? "Staging workbook rows on the server..." : "");
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

  const processImportPlan = useCallback(async (plan: ImportPlan, planIndex: number, totalPlans: number) => {
    let remainingCount = plan.validatedCount;
    let hasMoreRows = remainingCount > 0;
    const maximumBatches = Math.ceil(remainingCount / 25) + 1;
    let batchCount = 0;

    while (hasMoreRows) {
      if (batchCount >= maximumBatches) {
        throw new Error(`Plan ${plan.planNumber} did not finish within the expected number of batches.`);
      }
      const response = await fetch(`${endpoint}/plans/${plan.planNumber}/commit`, {
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, `Unable to import plan ${plan.planNumber}.`));
      const planProgress = isRecord(payload) && isRecord(payload.planProgress)
        ? payload.planProgress
        : null;
      if (!isRecord(payload) || !isRecord(payload.job)
        || !planProgress
        || typeof planProgress.hasMore !== "boolean"
        || !["recordCount", "validatedCount", "importedCount", "errorCount"].every((key) =>
          Number.isSafeInteger(planProgress[key]) && Number(planProgress[key]) >= 0)) {
        throw new Error("Plan import progress response is invalid.");
      }

      const progress = planProgress as {
        hasMore: boolean;
        recordCount: number;
        validatedCount: number;
        importedCount: number;
        errorCount: number;
      };
      const { hasMore, ...counts } = progress;
      if (hasMore !== (progress.validatedCount > 0)
        || (hasMore && progress.validatedCount >= remainingCount)) {
        throw new Error(`Plan ${plan.planNumber} did not report safe forward progress.`);
      }

      setJob(payload.job as ImportJob);
      setPlans((currentPlans) => currentPlans.map((currentPlan) =>
        currentPlan.planNumber === plan.planNumber
          ? { ...currentPlan, ...counts }
          : currentPlan));
      setPlanProgressByNumber((currentProgress) => ({
        ...currentProgress,
        [plan.planNumber]: counts,
      }));
      remainingCount = progress.validatedCount;
      hasMoreRows = hasMore;
      batchCount += 1;
      setNotice(
        `Plan ${plan.planNumber} (${planIndex} of ${totalPlans}) · ${progress.importedCount} of ${progress.recordCount} imported · ${progress.validatedCount} remaining · ${progress.errorCount} need attention.`,
      );
    }
    setNotice(`Plan ${plan.planNumber} completed. Starting the next planned import...`);
  }, [endpoint]);

  const startImportPlan = async (plan: ImportPlan) => {
    if (!job || plan.validatedCount === 0 || isProcessing) return;
    setActiveOperation("commit");
    setActivePlanNumber(plan.planNumber);
    setIsProcessing(true);
    setError("");
    try {
      await processImportPlan(plan, 1, 1);
      await loadJob();
      setNotice(`Plan ${plan.planNumber} import finished. Review any records needing attention.`);
    } catch (planError) {
      await loadJob();
      setError(planError instanceof Error ? planError.message : `Unable to import plan ${plan.planNumber}.`);
    } finally {
      setIsProcessing(false);
      setActiveOperation(null);
      setActivePlanNumber(null);
    }
  };

  const loadAllPendingPlans = useCallback(async () => {
    const allPlans: ImportPlan[] = [];
    let totalPlanCount: number | null = null;
    let offset = 0;

    do {
      const query = new URLSearchParams({
        limit: String(REPORT_PAGE_SIZE),
        offset: String(offset),
        tab: "planned",
      });
      const response = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, "Unable to load planned imports."));
      if (!isRecord(payload) || !Array.isArray(payload.plans)
        || !payload.plans.every(isImportPlan)
        || typeof payload.planCount !== "number"
        || !Number.isSafeInteger(payload.planCount) || payload.planCount < 0) {
        throw new Error("Planned import list response is invalid.");
      }
      if (totalPlanCount !== null && payload.planCount !== totalPlanCount) {
        throw new Error("The planned imports changed while loading. Refresh and retry.");
      }
      totalPlanCount = payload.planCount;
      const pagePlans = payload.plans as ImportPlan[];
      if (pagePlans.length === 0 && offset < totalPlanCount) {
        throw new Error("Unable to load every planned import.");
      }
      allPlans.push(...pagePlans);
      offset += pagePlans.length;
    } while (totalPlanCount !== null && offset < totalPlanCount);

    return allPlans;
  }, [endpoint]);

  const autoStartPlannedImports = async () => {
    if (!job || isProcessing) return;
    setActiveOperation("commit");
    setIsProcessing(true);
    setError("");
    try {
      const pendingPlans = (await loadAllPendingPlans())
        .filter((plan) => plan.validatedCount > 0)
        .sort((first, second) => first.planNumber - second.planNumber);
      if (pendingPlans.length === 0) {
        setNotice("There are no remaining validated records in the planned imports.");
        return;
      }
      for (const [index, plan] of pendingPlans.entries()) {
        setActivePlanNumber(plan.planNumber);
        setNotice(`Starting plan ${plan.planNumber} of ${pendingPlans.length}...`);
        await processImportPlan(plan, index + 1, pendingPlans.length);
      }
      await loadJob();
      setNotice(`All ${pendingPlans.length} planned imports finished. Review any records needing attention.`);
    } catch (importError) {
      await loadJob();
      setError(importError instanceof Error
        ? importError.message
        : "Unable to finish the planned imports. Later plans were not started.");
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

  const autoPlanStagedRows = async () => {
    if (!job || isProcessing) return;
    setActiveOperation("auto-plan");
    setIsProcessing(true);
    setError("");
    setNotice("Auto Plan is validating staged records in batches of up to 100...");
    try {
      const maxValidationBatches = Math.max(1, Math.ceil(job.totalRows / REPORT_PAGE_SIZE));
      let validatedRowCount = 0;
      let batchCount = 0;
      let createdPlanCount = 0;
      let plannedRowCount = 0;

      while (true) {
        const query = new URLSearchParams({
          limit: String(REPORT_PAGE_SIZE),
          offset: "0",
          tab: "staged",
        });
        const stagedResponse = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
        const stagedPayload: unknown = await stagedResponse.json();
        if (!stagedResponse.ok) {
          throw new Error(readError(stagedPayload, "Unable to load staged rows for Auto Plan."));
        }
        if (!isRecord(stagedPayload) || !Array.isArray(stagedPayload.rows)
          || !stagedPayload.rows.every(isImportRow)) {
          throw new Error("Staged rows response is invalid.");
        }
        const stagedRows = stagedPayload.rows;
        if (stagedRows.length === 0) break;
        if (batchCount >= maxValidationBatches || stagedRows.length > REPORT_PAGE_SIZE
          || stagedRows.some((row) => !Number.isSafeInteger(row.rowNumber)
            || row.rowNumber < 1
            || !["STAGED", "CORRECTED"].includes(row.status))) {
          throw new Error("Staged row batch is invalid or exceeded the safe Auto Plan limit.");
        }

        const rowNumbers = stagedRows.map((row) => row.rowNumber);
        const validationResponse = await fetch(`${endpoint}/validate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rowNumbers }),
        });
        const validationPayload: unknown = await validationResponse.json();
        if (!validationResponse.ok) {
          throw new Error(readError(validationPayload, "Unable to validate staged rows for Auto Plan."));
        }
        if (!isRecord(validationPayload) || !isRecord(validationPayload.job)) {
          throw new Error("Auto Plan validation response is invalid.");
        }
        if (!Array.isArray(validationPayload.validatedRowNumbers)
          || validationPayload.validatedRowNumbers.some((rowNumber) =>
            !Number.isSafeInteger(rowNumber) || !rowNumbers.includes(Number(rowNumber)))) {
          throw new Error("Auto Plan validated-row response is invalid.");
        }
        setJob(validationPayload.job as ImportJob);
        const validatedRowNumbers = validationPayload.validatedRowNumbers as number[];
        validatedRowCount += validatedRowNumbers.length;
        batchCount += 1;
        if (validatedRowNumbers.length > 0) {
          const planResponse = await fetch(`${endpoint}/plans`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rowNumbers: validatedRowNumbers }),
          });
          const planPayload: unknown = await planResponse.json();
          if (!planResponse.ok) {
            throw new Error(readError(planPayload, "Unable to create plans from newly validated records."));
          }
          if (!isRecord(planPayload) || typeof planPayload.planCount !== "number"
            || typeof planPayload.plannedRowCount !== "number") {
            throw new Error("Auto Plan response is invalid.");
          }
          createdPlanCount += planPayload.planCount;
          plannedRowCount += planPayload.plannedRowCount;
        }
        setNotice(`Auto Plan processed ${validatedRowCount} newly valid records so far...`);
      }

      setSelectedValidationRowIds([]);
      setActiveReportTab("planned");
      setReportPage(0);
      setNotice(
        `Auto Plan validated ${validatedRowCount} staged records and created ${createdPlanCount} plan${createdPlanCount === 1 ? "" : "s"} for ${plannedRowCount} valid records. Older validated rows were not included; invalid records remain in Errors.`,
      );
    } catch (autoPlanError) {
      await loadJob();
      setError(autoPlanError instanceof Error ? autoPlanError.message : "Unable to complete Auto Plan.");
    } finally {
      setIsProcessing(false);
      setActiveOperation(null);
    }
  };

  const runAutomaticImport = useCallback(async (initialJob: ImportJob) => {
    setIsProcessing(true);
    setError("");
    setNotice("Starting the automatic stage, plan, and import flow...");
    try {
      let currentJob = initialJob;
      if (currentJob.status === "COMPLETED") {
        setAutomaticPhase("complete");
        setNotice("This import is already complete.");
        return;
      }
      if (currentJob.status === "UPLOADING" || currentJob.status === "FAILED") {
        throw new Error("This upload cannot start automatically. Open the report and resolve its current status.");
      }
      if (currentJob.status === "UPLOADED") {
        setAutomaticPhase("staging");
        setNotice("Staging the workbook before planning...");
        const response = await fetch(`${endpoint}/stage`, { method: "POST" });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(readError(payload, "Unable to stage this workbook."));
        if (!isRecord(payload) || !isRecord(payload.job)) {
          throw new Error("Workbook staging response is invalid.");
        }
        currentJob = payload.job as ImportJob;
        setJob(currentJob);
        setNotice(`Staging complete: ${currentJob.totalRows} workbook rows found. Planning valid rows...`);
      }

      setAutomaticPhase("planning");
      let validationBatchCount = 0;
      let validatedRowsCount = 0;
      const maximumValidationBatches = Math.max(1, Math.ceil(currentJob.totalRows / REPORT_PAGE_SIZE) + 1);
      while (true) {
        const query = new URLSearchParams({
          limit: String(REPORT_PAGE_SIZE),
          offset: "0",
          tab: "staged",
        });
        const stagedResponse = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
        const stagedPayload: unknown = await stagedResponse.json();
        if (!stagedResponse.ok) {
          throw new Error(readError(stagedPayload, "Unable to load staged rows for automatic planning."));
        }
        if (!isRecord(stagedPayload) || !Array.isArray(stagedPayload.rows)
          || !stagedPayload.rows.every(isImportRow)) {
          throw new Error("Staged rows response is invalid.");
        }
        const stagedRows = stagedPayload.rows;
        if (stagedRows.length === 0) break;
        if (validationBatchCount >= maximumValidationBatches || stagedRows.length > REPORT_PAGE_SIZE
          || stagedRows.some((row) => !["STAGED", "CORRECTED"].includes(row.status))) {
          throw new Error("Staged rows exceeded the safe automatic planning limit.");
        }

        const rowNumbers = stagedRows.map((row) => row.rowNumber);
        const validationResponse = await fetch(`${endpoint}/validate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rowNumbers }),
        });
        const validationPayload: unknown = await validationResponse.json();
        if (!validationResponse.ok) {
          throw new Error(readError(validationPayload, "Unable to validate staged rows."));
        }
        if (!isRecord(validationPayload) || !isRecord(validationPayload.job)
          || !Array.isArray(validationPayload.validatedRowNumbers)
          || validationPayload.validatedRowNumbers.some((rowNumber) =>
            !Number.isSafeInteger(rowNumber) || !rowNumbers.includes(Number(rowNumber)))) {
          throw new Error("Automatic validation response is invalid.");
        }
        currentJob = validationPayload.job as ImportJob;
        setJob(currentJob);

        const validatedRowNumbers = validationPayload.validatedRowNumbers as number[];
        validatedRowsCount += validatedRowNumbers.length;
        if (validatedRowNumbers.length > 0) {
          const planResponse = await fetch(`${endpoint}/plans`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rowNumbers: validatedRowNumbers }),
          });
          const planPayload: unknown = await planResponse.json();
          if (!planResponse.ok) throw new Error(readError(planPayload, "Unable to plan validated rows."));
          if (!isRecord(planPayload) || typeof planPayload.planCount !== "number"
            || typeof planPayload.plannedRowCount !== "number") {
            throw new Error("Automatic plan response is invalid.");
          }
        }
        validationBatchCount += 1;
        setNotice(
          `Planning in progress: ${validatedRowsCount} valid rows prepared; invalid rows remain in Errors.`,
        );
      }

      const planResponse = await fetch(`${endpoint}/plans`, { method: "POST" });
      const planPayload: unknown = await planResponse.json();
      if (!planResponse.ok) throw new Error(readError(planPayload, "Unable to finish creating import plans."));
      if (!isRecord(planPayload) || typeof planPayload.planCount !== "number"
        || typeof planPayload.plannedRowCount !== "number") {
        throw new Error("Import plan response is invalid.");
      }
      setActiveReportTab("planned");
      setReportPage(0);

      setAutomaticPhase("importing");
      const pendingPlans = (await loadAllPendingPlans())
        .filter((plan) => plan.validatedCount > 0)
        .sort((first, second) => first.planNumber - second.planNumber);
      for (const [index, plan] of pendingPlans.entries()) {
        setActivePlanNumber(plan.planNumber);
        setNotice(`Importing plan ${index + 1} of ${pendingPlans.length}...`);
        await processImportPlan(plan, index + 1, pendingPlans.length);
      }
      setActivePlanNumber(null);
      await loadJob();
      const errorQuery = new URLSearchParams({
        limit: "1",
        offset: "0",
        tab: "errors",
      });
      const errorsResponse = await fetch(`${endpoint}?${errorQuery}`, { cache: "no-store" });
      const errorsPayload: unknown = await errorsResponse.json();
      if (!errorsResponse.ok || !isRecord(errorsPayload) || !isReportRowCounts(errorsPayload.rowCounts)) {
        throw new Error(readError(errorsPayload, "Unable to verify the final import status."));
      }
      if (errorsPayload.rowCounts.errors > 0) {
        setAutomaticPhase("attention");
        setNotice("Automatic processing finished. Some rows need correction in Errors.");
      } else {
        setAutomaticPhase("complete");
        setNotice("Staging, planning, and importing completed successfully.");
      }
    } catch (automaticError) {
      await loadJob();
      setAutomaticPhase("attention");
      setError(automaticError instanceof Error
        ? automaticError.message
        : "Automatic import stopped. Open the report to continue manually.");
      setNotice("Automatic processing stopped; the manual recovery controls remain available.");
    } finally {
      setIsProcessing(false);
      setActiveOperation(null);
      setActivePlanNumber(null);
    }
  }, [endpoint, loadAllPendingPlans, loadJob, processImportPlan]);

  useEffect(() => {
    if (!job || isLoading || automaticFlowStartedForJob.current === job.id) return;
    if (new URLSearchParams(window.location.search).get("autoStart") !== "1") return;
    automaticFlowStartedForJob.current = job.id;
    const timer = window.setTimeout(() => void runAutomaticImport(job), 0);
    return () => window.clearTimeout(timer);
  }, [isLoading, job, runAutomaticImport]);

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
  const remainingRecords = job
    ? Math.max(0, job.totalRows - job.successfulRows - job.failedRows)
    : 0;
  const handledRecords = job
    ? Math.min(job.totalRows, Math.max(job.processedRows, job.successfulRows + job.failedRows))
    : 0;
  const progressPercent = job && job.totalRows > 0
    ? Math.floor((handledRecords / job.totalRows) * 100)
    : 0;
  const overallStatus = automaticPhase !== "idle"
    ? {
        staging: "Staging workbook",
        planning: "Planning records",
        importing: "Importing records",
        complete: "Import complete",
        attention: "Needs attention",
      }[automaticPhase]
    : job?.status === "UPLOADED"
      ? "Ready to stage"
      : job?.status === "STAGED"
        ? "Stage complete · ready to plan"
        : job?.status === "VALIDATED"
          ? "Ready to plan"
          : job?.status === "IMPORTING"
            ? "Import in progress"
            : job?.status === "PARTIAL"
              ? "Needs attention"
              : job?.status === "COMPLETED"
                ? "Import complete"
                : job?.status === "FAILED"
                  ? "Stopped"
                  : "Loading status";
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
            {activeReportTab === "planned" ? (
              <Button
                type="button"
                onClick={() => void autoStartPlannedImports()}
                disabled={isProcessing || planCount === 0}
              >
                {isProcessing && activeOperation === "commit"
                  ? `Importing plan ${activePlanNumber ?? ""}...`
                  : "Auto start import"}
              </Button>
            ) : null}
            {activeReportTab === "staged" ? (
              <>
                <Button
                  type="button"
                  onClick={() => void autoPlanStagedRows()}
                  disabled={isProcessing || (rowCounts.staged === 0 && rowCounts.validated === 0)}
                >
                  {isProcessing && activeOperation === "auto-plan" ? "Auto Planning..." : "Auto Plan"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void runOperation("validate", selectedValidationRowNumbers)}
                  disabled={isProcessing || selectedValidationRowNumbers.length === 0}
                >
                  {isProcessing && activeOperation === "validate"
                    ? "Validating..."
                    : `Validate selected (${selectedValidationRowNumbers.length})`}
                </Button>
              </>
            ) : null}
          </div>
        </header>

        {job ? (
          <Card className="space-y-3 p-4 sm:p-6">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-[var(--erp-text)]">Overall import progress</h2>
                  <Badge className={statusTone(
                    automaticPhase === "complete" ? "COMPLETED"
                      : automaticPhase === "attention" ? "PARTIAL"
                        : automaticPhase === "importing" ? "IMPORTING"
                          : job.status,
                  )}>
                    {overallStatus}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--erp-muted)]">
                  {handledRecords} of {job.totalRows} handled · {job.successfulRows} imported · {job.failedRows} need attention
                </p>
              </div>
              <div className="min-w-0 text-sm sm:text-right">
                <p className="font-semibold text-[var(--erp-text)]">Estimated time remaining</p>
                <p className="text-[var(--erp-brand)]">
                  {formatEstimatedTime(remainingRecords)}
                </p>
                <p className="text-xs text-[var(--erp-muted)]">
                  Estimate uses 5 seconds per remaining record; errors need manual review.
                </p>
              </div>
            </div>
            <progress
              className="h-2 w-full accent-[var(--erp-brand)]"
              aria-label="Overall import progress"
              aria-valuetext={`${handledRecords} of ${job.totalRows} records handled`}
              max={100}
              value={progressPercent}
            />
          </Card>
        ) : null}

        {notice ? <p className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-success)]" role="status">{notice}</p> : null}
        {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
        {job?.status === "UPLOADING" ? (
          <Card className="p-6 text-sm text-[var(--erp-muted)]">
            Upload is incomplete ({job.uploadedFileChunks} of {job.fileChunkCount} chunks saved). Upload the workbook again to restart.
          </Card>
        ) : null}
        {job?.status === "UPLOADED" ? (
          <Card className="p-6 text-sm text-[var(--erp-muted)]">
            The workbook is saved on the server. Stage it to parse all rows into temporary import records.
          </Card>
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
                Auto start imports each pending plan in order and moves on only after that plan is finished. Per-plan totals update as rows import; records already imported are skipped, and any row needing attention stays in Errors.
              </p>
              {plans.map((plan) => {
                const counts = planProgressByNumber[plan.planNumber] ?? plan;
                return (
                  <Card key={plan.planNumber} className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[var(--erp-text)]">Plan {plan.planNumber}</h3>
                        <Badge className={statusTone(activePlanNumber === plan.planNumber
                          ? "IMPORTING"
                          : counts.validatedCount > 0
                            ? counts.importedCount > 0 ? "IMPORTING" : "VALIDATED"
                            : counts.errorCount > 0 ? "PARTIAL" : "COMPLETED")}>
                          {activePlanNumber === plan.planNumber
                            ? "Importing"
                            : counts.validatedCount > 0
                              ? counts.importedCount > 0 ? "In progress" : "Ready"
                              : counts.errorCount > 0
                                ? counts.importedCount > 0 ? "Completed with errors" : "Needs attention"
                                : "Completed"}
                        </Badge>
                      </div>
                      <p className="text-sm text-[var(--erp-muted)]" aria-live="polite">
                        {counts.recordCount} total · {counts.importedCount} imported · {counts.validatedCount} remaining · {counts.errorCount} need attention
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => void startImportPlan({ ...plan, ...counts })}
                      disabled={isProcessing || counts.validatedCount === 0}
                    >
                      {activePlanNumber === plan.planNumber ? "Importing..." : "Start import"}
                    </Button>
                  </Card>
                );
              })}
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
