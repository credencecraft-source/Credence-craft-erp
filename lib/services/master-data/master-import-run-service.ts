import { MasterImportRunStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import {
  MasterImportServiceError,
  MASTER_IMPORT_PLAN_SIZE,
  MASTER_IMPORT_VALIDATION_BATCH_SIZE,
  MASTER_IMPORT_VALIDATION_RUN_BATCH_SIZE,
  commitNextMasterImportRow,
  createMasterImportPlans,
  getMasterImportCommitLookupIndex,
  getMasterImportValidationContext,
  getMasterImportPlanProgress,
  getValidatedMasterImportPlanRows,
  stageMasterImportJob,
  validateMasterImportJob,
} from "@/lib/services/master-data/master-import-service";

const RUN_LEASE_SECONDS = 360;
const WORKER_TIME_BUDGET_MS = 240_000;
const IMPORT_ROW_BATCH_SIZE = 25;
const CANCELLED_RUN_ERROR = "Cancelled by user.";

export type MasterImportRunOperation = "STAGE" | "VALIDATE" | "PLAN" | "IMPORT_PLAN" | "IMPORT_ALL";

type MasterImportRunInput = {
  rowNumbers?: number[];
  planNumber?: number;
  planNumbers?: number[];
  nextPlanIndex?: number;
};

function publicRun(run: {
  id: string;
  job_id: string;
  operation: string;
  status: MasterImportRunStatus;
  progress: number;
  total: number;
  attempt_count: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}) {
  const isCancelled = run.status === MasterImportRunStatus.FAILED
    && run.last_error === CANCELLED_RUN_ERROR;
  return {
    id: run.id,
    jobId: run.job_id,
    operation: run.operation,
    status: isCancelled ? "CANCELLED" : run.status,
    progress: run.progress,
    total: run.total,
    attemptCount: run.attempt_count,
    error: isCancelled ? null : run.last_error,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    startedAt: run.started_at,
    completedAt: run.completed_at,
  };
}

export async function enqueueMasterImportRun(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  operation: MasterImportRunOperation;
  rowNumbers?: number[];
  take?: number;
  planNumber?: number;
}) {
  let rowNumbers = input.rowNumbers;
  if (input.take !== undefined) {
    if (input.operation !== "VALIDATE"
      || !Number.isSafeInteger(input.take)
      || input.take < 1
      || input.take > MASTER_IMPORT_VALIDATION_BATCH_SIZE
      || rowNumbers !== undefined) {
      throw new MasterImportServiceError("Staged validation request is invalid.", 400);
    }
    const rows = await prisma.masterImportJobRow.findMany({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        status: { in: ["STAGED", "CORRECTED"] },
      },
      orderBy: { row_number: "asc" },
      take: input.take,
      select: { row_number: true },
    });
    rowNumbers = rows.map((row) => row.row_number);
    if (rowNumbers.length === 0) {
      throw new MasterImportServiceError("There are no staged rows awaiting validation.", 409);
    }
  }

  const maximumRowNumbers = input.operation === "PLAN"
    ? MASTER_IMPORT_PLAN_SIZE
    : MASTER_IMPORT_VALIDATION_BATCH_SIZE;
  if (rowNumbers !== undefined
    && (rowNumbers.length < 1
      || rowNumbers.length > maximumRowNumbers
      || new Set(rowNumbers).size !== rowNumbers.length
      || rowNumbers.some((rowNumber) => !Number.isSafeInteger(rowNumber) || rowNumber < 1))) {
    throw new MasterImportServiceError("Selected import rows are invalid.", 400);
  }
  if ((input.operation === "VALIDATE") !== (rowNumbers !== undefined)
    || (input.operation === "PLAN" && rowNumbers !== undefined && rowNumbers.length === 0)) {
    throw new MasterImportServiceError("Selected rows are required for this import operation.", 400);
  }
  if ((input.operation === "IMPORT_PLAN") !== (input.planNumber !== undefined)
    || (input.planNumber !== undefined
      && (!Number.isSafeInteger(input.planNumber) || input.planNumber < 1))) {
    throw new MasterImportServiceError("Import plan number is invalid.", 400);
  }
  if (input.operation === "IMPORT_ALL" && (input.planNumber !== undefined || rowNumbers !== undefined)) {
    throw new MasterImportServiceError("Import all plans request is invalid.", 400);
  }

  const run = await prisma.$transaction(async (transaction) => {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "master_import_jobs"
      WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.jobId}
      FOR UPDATE
    `);
    if (locked.length !== 1) throw new MasterImportServiceError("Import job not found.", 404);
    const job = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
      select: { status: true, expires_at: true },
    });
    if (!job) throw new MasterImportServiceError("Import job not found.", 404);
    if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
    const active = await transaction.masterImportRun.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        status: { in: [MasterImportRunStatus.QUEUED, MasterImportRunStatus.RUNNING] },
      },
      select: { id: true },
    });
    if (active) throw new MasterImportServiceError("Another background operation is already queued or running.", 409);

    const allowedStatuses = input.operation === "STAGE"
      ? [ "UPLOADED" ]
      : input.operation === "IMPORT_PLAN" || input.operation === "IMPORT_ALL"
        ? [ "STAGED", "VALIDATED", "IMPORTING", "PARTIAL" ]
        : [ "STAGED", "VALIDATED", "PARTIAL" ];
    if (!allowedStatuses.includes(job.status)) {
      throw new MasterImportServiceError("This import cannot run that operation at its current stage.", 409);
    }
    const planNumbers = input.operation === "IMPORT_ALL"
      ? [...new Set((await transaction.masterImportJobRow.groupBy({
          by: ["plan_number"],
          where: {
            organization_id: input.organizationId,
            job_id: input.jobId,
            plan_number: { not: null },
            status: "VALIDATED",
          },
          orderBy: { plan_number: "asc" },
        })).flatMap((group) => group.plan_number === null ? [] : [group.plan_number]))]
      : undefined;

    const created = await transaction.masterImportRun.create({
      data: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        operation: input.operation,
        input: {
          ...(rowNumbers ? { rowNumbers } : {}),
          ...(input.planNumber !== undefined ? { planNumber: input.planNumber } : {}),
          ...(planNumbers ? { planNumbers, nextPlanIndex: 0 } : {}),
        },
        total: rowNumbers?.length ?? planNumbers?.length ?? 0,
        requested_by_user_id: input.actorUserId,
      },
    });
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_RUN_QUEUED",
      entityType: "MasterImportRun",
      entityId: created.id,
      details: {
        jobId: input.jobId,
        operation: input.operation,
        requestedRows: rowNumbers?.length ?? null,
      },
    }, transaction);
    return created;
  });

  return { run: publicRun(run) };
}

export async function getMasterImportRun(organizationId: string, runId: string) {
  const run = await prisma.masterImportRun.findFirst({
    where: { organization_id: organizationId, id: runId },
  });
  if (!run) throw new MasterImportServiceError("Import run not found.", 404);
  return { run: publicRun(run) };
}

export async function cancelMasterImportRun(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  runId: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.masterImportRun.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        id: input.runId,
      },
    });
    if (!existing) throw new MasterImportServiceError("Import run not found.", 404);
    if (existing.operation !== "VALIDATE") {
      throw new MasterImportServiceError("Only validation runs can be stopped.", 409);
    }
    if (existing.status === MasterImportRunStatus.FAILED
      && existing.last_error === CANCELLED_RUN_ERROR) {
      return { run: publicRun(existing) };
    }

    const cancelledAt = new Date();
    const updated = await transaction.masterImportRun.updateMany({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        id: input.runId,
        operation: "VALIDATE",
        status: { in: [MasterImportRunStatus.QUEUED, MasterImportRunStatus.RUNNING] },
      },
      data: {
        status: MasterImportRunStatus.FAILED,
        last_error: CANCELLED_RUN_ERROR,
        lease_expires_at: null,
        completed_at: cancelledAt,
        updated_at: cancelledAt,
      },
    });
    if (updated.count !== 1) {
      throw new MasterImportServiceError("This validation run is no longer active.", 409);
    }

    const cancelled = await transaction.masterImportRun.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        id: input.runId,
      },
    });
    if (!cancelled) throw new MasterImportServiceError("Import run not found.", 404);
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_RUN_CANCELLED",
      entityType: "MasterImportRun",
      entityId: input.runId,
      details: {
        jobId: input.jobId,
        operation: existing.operation,
        progress: cancelled.progress,
        total: cancelled.total,
      },
    }, transaction);
    return { run: publicRun(cancelled) };
  });
}

export async function getActiveMasterImportRun(organizationId: string, jobId: string) {
  const run = await prisma.masterImportRun.findFirst({
    where: {
      organization_id: organizationId,
      job_id: jobId,
      status: { in: [MasterImportRunStatus.QUEUED, MasterImportRunStatus.RUNNING] },
    },
    orderBy: { created_at: "desc" },
  });
  return { run: run ? publicRun(run) : null };
}

function parseRunInput(value: unknown): MasterImportRunInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.rowNumbers !== undefined
    && (!Array.isArray(record.rowNumbers)
      || record.rowNumbers.some((number) => !Number.isSafeInteger(number) || Number(number) < 1))) return null;
  if (record.planNumber !== undefined
    && (!Number.isSafeInteger(record.planNumber) || Number(record.planNumber) < 1)) return null;
  if (record.planNumbers !== undefined
    && (!Array.isArray(record.planNumbers)
      || record.planNumbers.some((number) => !Number.isSafeInteger(number) || Number(number) < 1))) return null;
  if (record.nextPlanIndex !== undefined
    && (!Number.isSafeInteger(record.nextPlanIndex) || Number(record.nextPlanIndex) < 0)) return null;
  if (Object.keys(record).some((key) => !["rowNumbers", "planNumber", "planNumbers", "nextPlanIndex"].includes(key))) return null;
  return record as MasterImportRunInput;
}

type MasterImportWorkerScope = {
  organizationId?: string;
  jobId?: string;
  runId?: string;
};

async function claimNextRun(scope: MasterImportWorkerScope) {
  const scopedRun = scope.organizationId && scope.jobId && scope.runId
    ? Prisma.sql`AND "organization_id" = ${scope.organizationId}
        AND "job_id" = ${scope.jobId}
        AND "id" = ${scope.runId}`
    : Prisma.empty;
  const candidates = await prisma.$queryRaw<Array<{ organization_id: string; id: string }>>(Prisma.sql`
    WITH candidate AS (
      SELECT "organization_id", "id"
      FROM "master_import_runs"
      WHERE (
        "status" = 'QUEUED'::"MasterImportRunStatus"
        OR ("status" = 'RUNNING'::"MasterImportRunStatus" AND "lease_expires_at" < CURRENT_TIMESTAMP)
      )
      ${scopedRun}
      ORDER BY "created_at", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "master_import_runs" AS run
    SET
      "status" = 'RUNNING'::"MasterImportRunStatus",
      "attempt_count" = run."attempt_count" + 1,
      "lease_expires_at" = CURRENT_TIMESTAMP + (${RUN_LEASE_SECONDS} * INTERVAL '1 second'),
      "started_at" = COALESCE(run."started_at", CURRENT_TIMESTAMP),
      "updated_at" = CURRENT_TIMESTAMP
    FROM candidate
    WHERE run."organization_id" = candidate."organization_id" AND run."id" = candidate."id"
    RETURNING run."organization_id", run."id"
  `);
  if (!candidates[0]) return null;
  return prisma.masterImportRun.findFirst({
    where: { organization_id: candidates[0].organization_id, id: candidates[0].id },
  });
}

async function updateRun(
  organizationId: string,
  runId: string,
  data: Prisma.MasterImportRunUpdateManyMutationInput,
) {
  const updated = await prisma.masterImportRun.updateMany({
    where: {
      organization_id: organizationId,
      id: runId,
      status: MasterImportRunStatus.RUNNING,
    },
    data: { ...data, updated_at: new Date() },
  });
  if (updated.count !== 1) throw new MasterImportServiceError("Background import lease was lost.", 409);
}

async function isValidationRunCancelled(organizationId: string, runId: string) {
  const current = await prisma.masterImportRun.findFirst({
    where: { organization_id: organizationId, id: runId },
    select: { status: true, last_error: true },
  });
  return current?.status === MasterImportRunStatus.FAILED
    && current.last_error === CANCELLED_RUN_ERROR;
}

async function executeRun(run: NonNullable<Awaited<ReturnType<typeof claimNextRun>>>, deadline: number) {
  const runInput = parseRunInput(run.input);
  if (!runInput) throw new MasterImportServiceError("Background import request is invalid.", 400);

  if (run.operation === "STAGE") {
    const result = await stageMasterImportJob({
      organizationId: run.organization_id,
      actorUserId: run.requested_by_user_id,
      jobId: run.job_id,
    });
    await updateRun(run.organization_id, run.id, {
      status: MasterImportRunStatus.COMPLETED,
      progress: result.job.totalRows,
      total: result.job.totalRows,
      lease_expires_at: null,
      completed_at: new Date(),
    });
    return true;
  }
  if (run.operation === "VALIDATE") {
    if (!runInput.rowNumbers) throw new MasterImportServiceError("Background validation rows are missing.", 400);
    if (run.progress > runInput.rowNumbers.length || run.total !== runInput.rowNumbers.length) {
      throw new MasterImportServiceError("Background validation progress is invalid.", 409);
    }
    const validationContext = await getMasterImportValidationContext(run.organization_id, run.job_id);
    const batchSize = validationContext.moduleKey === "article"
      ? runInput.rowNumbers.length
      : MASTER_IMPORT_VALIDATION_RUN_BATCH_SIZE;
    let progress = run.progress;
    while (progress < runInput.rowNumbers.length && Date.now() < deadline) {
      if (await isValidationRunCancelled(run.organization_id, run.id)) return false;
      const rowNumbers = runInput.rowNumbers.slice(progress, progress + batchSize);
      await validateMasterImportJob({
        organizationId: run.organization_id,
        actorUserId: run.requested_by_user_id,
        jobId: run.job_id,
        rowNumbers,
        ...(validationContext.lookupIndex ? { lookupIndex: validationContext.lookupIndex } : {}),
        runProgress: { runId: run.id, expectedProgress: progress },
      });
      progress += rowNumbers.length;
    }
    if (progress < runInput.rowNumbers.length) {
      await updateRun(run.organization_id, run.id, {
        status: MasterImportRunStatus.QUEUED,
        lease_expires_at: null,
      });
      return false;
    }
    await updateRun(run.organization_id, run.id, {
      status: MasterImportRunStatus.COMPLETED,
      progress: runInput.rowNumbers.length,
      total: runInput.rowNumbers.length,
      lease_expires_at: null,
      completed_at: new Date(),
    });
    return true;
  }
  if (run.operation === "PLAN") {
    const result = await createMasterImportPlans({
      organizationId: run.organization_id,
      actorUserId: run.requested_by_user_id,
      jobId: run.job_id,
      ...(runInput.rowNumbers ? { rowNumbers: runInput.rowNumbers } : {}),
    });
    await updateRun(run.organization_id, run.id, {
      status: MasterImportRunStatus.COMPLETED,
      progress: result.plannedRowCount,
      total: runInput.rowNumbers?.length ?? result.plannedRowCount,
      lease_expires_at: null,
      completed_at: new Date(),
    });
    return true;
  }
  if (run.operation === "IMPORT_PLAN" || run.operation === "IMPORT_ALL") {
    const planNumbers = run.operation === "IMPORT_PLAN"
      ? runInput.planNumber ? [runInput.planNumber] : []
      : runInput.planNumbers ?? [];
    if (planNumbers.length === 0) {
      await updateRun(run.organization_id, run.id, {
        status: MasterImportRunStatus.COMPLETED,
        progress: 0,
        total: 0,
        lease_expires_at: null,
        completed_at: new Date(),
      });
      return true;
    }
    const lookupIndex = await getMasterImportCommitLookupIndex(run.organization_id, run.job_id);
    let currentPlanIndex = runInput.nextPlanIndex ?? 0;
    let total = run.operation === "IMPORT_ALL"
      ? planNumbers.length
      : run.total;
    let progress = run.progress;
    while (currentPlanIndex < planNumbers.length && Date.now() < deadline) {
      const planNumber = planNumbers[currentPlanIndex];
      let planProgress = await getMasterImportPlanProgress(run.organization_id, run.job_id, planNumber);
      if (run.operation === "IMPORT_PLAN") total = planProgress.recordCount;
      while (planProgress.validatedCount > 0 && Date.now() < deadline) {
        const rowNumbers = await getValidatedMasterImportPlanRows(run.organization_id, run.job_id, planNumber);
        if (rowNumbers.length === 0) break;
        for (const rowNumber of rowNumbers.slice(0, IMPORT_ROW_BATCH_SIZE)) {
          await commitNextMasterImportRow({
            organizationId: run.organization_id,
            actorUserId: run.requested_by_user_id,
            jobId: run.job_id,
            rowNumber,
            ...(lookupIndex ? { lookupIndex } : {}),
          });
        }
        planProgress = await getMasterImportPlanProgress(run.organization_id, run.job_id, planNumber);
        progress = run.operation === "IMPORT_ALL"
          ? currentPlanIndex
          : planProgress.importedCount + planProgress.errorCount;
        await updateRun(run.organization_id, run.id, {
          total,
          progress,
          input: { ...runInput, nextPlanIndex: currentPlanIndex },
          lease_expires_at: new Date(Date.now() + RUN_LEASE_SECONDS * 1_000),
        });
      }
      if (planProgress.validatedCount > 0) break;
      currentPlanIndex += 1;
      progress = run.operation === "IMPORT_ALL"
        ? currentPlanIndex
        : planProgress.importedCount + planProgress.errorCount;
      await updateRun(run.organization_id, run.id, {
        total,
        progress,
        input: { ...runInput, nextPlanIndex: currentPlanIndex },
        lease_expires_at: new Date(Date.now() + RUN_LEASE_SECONDS * 1_000),
      });
    }
    if (currentPlanIndex < planNumbers.length) {
      await updateRun(run.organization_id, run.id, {
        status: MasterImportRunStatus.QUEUED,
        total,
        progress,
        input: { ...runInput, nextPlanIndex: currentPlanIndex },
        lease_expires_at: null,
      });
      return false;
    }
    await updateRun(run.organization_id, run.id, {
      status: MasterImportRunStatus.COMPLETED,
      total,
      progress,
      lease_expires_at: null,
      completed_at: new Date(),
    });
    return true;
  }
  throw new MasterImportServiceError("Background import operation is unsupported.", 400);
}

export async function runMasterImportWorkerBatch(input: MasterImportWorkerScope & { timeBudgetMs?: number } = {}) {
  const scopedValues = [input.organizationId, input.jobId, input.runId];
  if (scopedValues.some(Boolean) && !scopedValues.every(Boolean)) {
    throw new MasterImportServiceError("Background import worker scope is invalid.", 400);
  }
  const timeBudgetMs = Math.min(input.timeBudgetMs ?? WORKER_TIME_BUDGET_MS, WORKER_TIME_BUDGET_MS);
  const deadline = Date.now() + timeBudgetMs;
  let claimedRuns = 0;
  let completedRuns = 0;
  let failedRuns = 0;

  while (Date.now() < deadline) {
    const run = await claimNextRun(input);
    if (!run) break;
    claimedRuns += 1;
    try {
      const completed = await executeRun(run, deadline);
      if (completed) completedRuns += 1;
      else break;
    } catch (error) {
      if (await isValidationRunCancelled(run.organization_id, run.id)) break;
      failedRuns += 1;
      const message = error instanceof MasterImportServiceError
        ? error.message
        : "The background import failed. Review errors and retry the operation.";
      console.error("Master import background operation failed.", {
        runId: run.id,
        jobId: run.job_id,
        operation: run.operation,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      await updateRun(run.organization_id, run.id, {
        status: MasterImportRunStatus.FAILED,
        last_error: message.slice(0, 1000),
        lease_expires_at: null,
        completed_at: new Date(),
      });
    }
  }
  return { claimedRuns, completedRuns, failedRuns };
}
