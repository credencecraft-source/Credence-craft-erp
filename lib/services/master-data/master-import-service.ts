import { createHash } from "node:crypto";

import {
  MasterImportJobRowStatus,
  MasterImportJobStatus,
  Prisma,
} from "@prisma/client";

import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import { prisma } from "@/lib/database/prisma-client";
import { parseContactWorkbook } from "@/lib/master-data/contact-records-workbook-parser";
import { ContactValidationError, parseContactInput, type ContactInput } from "@/lib/services/master-data/contact-master-validation";
import { createContact } from "@/lib/services/master-data/contact-master-service";
import { groupArticleMatrixRowsWithErrors } from "@/lib/master-data/article-import-workbook";
import { parseFinishedGoodsSizePrices } from "@/lib/services/master-data/finished-goods-size-service";
import {
  createMasterValueForOrganization,
  getMasterDefinition,
  isActiveMasterLookupInIndex,
  loadActiveMasterLookupIndex,
  type ActiveMasterLookupIndex,
  type ActiveMasterLookupRecord,
  type MasterFieldValues,
} from "@/lib/master-data/master-data-constants";
import { parseMasterRecordsWorkbook } from "@/lib/master-data/master-records-workbook";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

export const MASTER_IMPORT_MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MASTER_IMPORT_UPLOAD_CHUNK_BYTES = 1024 * 1024;
export const MASTER_IMPORT_ROW_PAYLOAD_MAX_BYTES = 128 * 1024;
export const MASTER_IMPORT_RETENTION_DAYS = 30;
export const MASTER_IMPORT_REPORT_PAGE_SIZE = 1_000;
export const MASTER_IMPORT_VALIDATION_BATCH_SIZE = 10_000;
export const MASTER_IMPORT_VALIDATION_RUN_BATCH_SIZE = 100;
export const MASTER_IMPORT_PLAN_SIZE = 1_000;
const MASTER_IMPORT_PLAN_BATCH_SIZE = 25;
const MASTER_IMPORT_STAGING_ROW_BATCH_SIZE = 5_000;
const MASTER_IMPORT_VALIDATION_WRITE_BATCH_SIZE = 500;
const MASTER_IMPORT_VALIDATION_BULK_WRITE_THRESHOLD = 25;
const MASTER_IMPORT_RUN_LEASE_SECONDS = 360;

const MASTER_IMPORT_UPLOAD_TRANSACTION_MAX_WAIT_MS = 10_000;
const MASTER_IMPORT_UPLOAD_TRANSACTION_TIMEOUT_MS = 20_000;
const MASTER_IMPORT_STAGING_TRANSACTION_MAX_WAIT_MS = 10_000;
const MASTER_IMPORT_STAGING_TRANSACTION_TIMEOUT_MS = 120_000;
const MASTER_IMPORT_COMMIT_TRANSACTION_MAX_WAIT_MS = 10_000;
const MASTER_IMPORT_COMMIT_TRANSACTION_TIMEOUT_MS = 30_000;

const JOB_STATUSES = [
  "UPLOADED",
  "STAGED",
  "VALIDATED",
  "IMPORTING",
  "PARTIAL",
  "COMPLETED",
  "FAILED",
] as const;

export type MasterImportJobStatusValue = (typeof JOB_STATUSES)[number];

export class MasterImportServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MasterImportServiceError";
  }
}

function isJobStatus(value: unknown): value is MasterImportJobStatusValue {
  return typeof value === "string" && JOB_STATUSES.includes(value as MasterImportJobStatusValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidImportDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isCheckpoint(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value);
}

function publicJob(job: {
  id: string;
  module_key: string;
  status: MasterImportJobStatus;
  uploaded_file_name: string;
  uploaded_file_size: number;
  file_chunk_count: number;
  uploaded_file_chunks: number;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  failed_rows: number;
  checkpoint: string | null;
  created_at: Date;
  updated_at: Date;
  staged_at: Date | null;
  validated_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  expires_at: Date;
}, uploaderDisplayName: string | null = null) {
  return {
    id: job.id,
    moduleKey: job.module_key,
    uploaderDisplayName,
    status: job.status,
    uploadedFileName: job.uploaded_file_name,
    uploadedFileSize: job.uploaded_file_size,
    fileChunkCount: job.file_chunk_count,
    uploadedFileChunks: job.uploaded_file_chunks,
    totalRows: job.total_rows,
    processedRows: job.processed_rows,
    successfulRows: job.successful_rows,
    failedRows: job.failed_rows,
    checkpoint: job.checkpoint,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    stagedAt: job.staged_at,
    validatedAt: job.validated_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    failedAt: job.failed_at,
    expiresAt: job.expires_at,
  };
}

export async function authorizeMasterImportRequest(
  userId: string,
  workspaceId: string,
  publicOrganizationId: string,
) {
  if (!userId || !workspaceId) {
    throw new MasterImportServiceError("Authentication is required.", 401);
  }
  const workspaceUser = await prisma.workspaceUser.findFirst({
    where: { id: userId, workspace_id: workspaceId },
    select: { id: true },
  });
  if (!workspaceUser) throw new MasterImportServiceError("Authentication is required.", 401);

  let context: Awaited<ReturnType<typeof requireOrganizationContext>>;
  try {
    context = await requireOrganizationContext(userId, publicOrganizationId);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("access denied")) {
      throw new MasterImportServiceError("Organization not found.", 404);
    }
    throw error;
  }

  try {
    await requireOrganizationPermission(userId, context.id, "MANAGE_MASTER_DATA");
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("access denied")) {
      throw new MasterImportServiceError("You do not have permission to manage master imports.", 403);
    }
    throw error;
  }

  return { userId, workspaceId, organizationId: context.id };
}

function validateModuleKey(moduleKey: unknown): asserts moduleKey is string {
  if (typeof moduleKey !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(moduleKey)) {
    throw new MasterImportServiceError("Select a valid master module.", 400);
  }
  if (moduleKey !== "contact") {
    const definition = getMasterDefinition(moduleKey);
    if (!definition || definition.hidden) {
      throw new MasterImportServiceError("Select a valid master module.", 400);
    }
  }
}

function safeUploadedFileName(fileName: string) {
  const name = fileName.replace(/\\/g, "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!name || name.length > 255 || !name.toLowerCase().endsWith(".xlsx")) {
    throw new MasterImportServiceError("Upload an .xlsx workbook with a valid file name.", 400);
  }
  return name;
}

export async function listMasterImportJobs(
  organizationId: string,
  pagination: { skip: number; take: number } = { skip: 0, take: 100 },
) {
  const jobs = await prisma.masterImportJob.findMany({
    where: { organization_id: organizationId, expires_at: { gt: new Date() } },
    orderBy: { created_at: "desc" },
    skip: pagination.skip,
    take: pagination.take,
    select: {
      id: true,
      organization_id: true,
      module_key: true,
      status: true,
      uploaded_file_name: true,
      uploaded_file_size: true,
      file_chunk_count: true,
      uploaded_file_chunks: true,
      total_rows: true,
      processed_rows: true,
      successful_rows: true,
      failed_rows: true,
      checkpoint: true,
      created_by_user_id: true,
      updated_by_user_id: true,
      created_at: true,
      updated_at: true,
      staged_at: true,
      validated_at: true,
      started_at: true,
      completed_at: true,
      failed_at: true,
      expires_at: true,
    },
  });
  const uploaderIds = [...new Set(jobs.map((job) => job.created_by_user_id))];
  const uploaders = uploaderIds.length
    ? await prisma.workspaceUser.findMany({
        where: {
          id: { in: uploaderIds },
          organizationMemberships: { some: { organization_id: organizationId, is_active: true } },
        },
        select: { id: true, full_name: true },
      })
    : [];
  const uploaderNames = new Map(uploaders.map((uploader) => [uploader.id, uploader.full_name]));
  return jobs.map((job) => publicJob(job, uploaderNames.get(job.created_by_user_id) ?? null));
}

export async function createMasterImportJob(input: {
  organizationId: string;
  actorUserId: string;
  uploaderDisplayName?: string;
  moduleKey: unknown;
  uploadedFileName: string;
  uploadedFileSize: number;
  sourceSha256: string;
}) {
  const moduleKey = input.moduleKey;
  validateModuleKey(moduleKey);
  const uploadedFileName = safeUploadedFileName(input.uploadedFileName);
  if (!Number.isSafeInteger(input.uploadedFileSize)
    || input.uploadedFileSize < 1 || input.uploadedFileSize > MASTER_IMPORT_MAX_FILE_SIZE) {
    throw new MasterImportServiceError("Workbook file must be between 1 byte and 50 MiB.", 413);
  }
  if (!/^[a-f0-9]{64}$/.test(input.sourceSha256)) {
    throw new MasterImportServiceError("Workbook integrity fingerprint is invalid.", 400);
  }

  const expiresAt = new Date(Date.now() + MASTER_IMPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const fileChunkCount = Math.ceil(input.uploadedFileSize / MASTER_IMPORT_UPLOAD_CHUNK_BYTES);
  const job = await prisma.$transaction(async (transaction) => {
    const created = await transaction.masterImportJob.create({
      data: {
        organization_id: input.organizationId,
        module_key: moduleKey,
        status: MasterImportJobStatus.UPLOADING,
        uploaded_file_name: uploadedFileName,
        uploaded_file_size: input.uploadedFileSize,
        file_chunk_count: fileChunkCount,
        uploaded_file_chunks: 0,
        source_sha256: input.sourceSha256,
        encrypted_source_file: Buffer.alloc(0),
        created_by_user_id: input.actorUserId,
        updated_by_user_id: input.actorUserId,
        expires_at: expiresAt,
      },
    });
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_UPLOAD_STARTED",
      entityType: "MasterImportJob",
      entityId: created.id,
      details: { moduleKey, fileSize: input.uploadedFileSize, fileChunkCount },
    }, transaction);
    return created;
  }, {
    maxWait: MASTER_IMPORT_UPLOAD_TRANSACTION_MAX_WAIT_MS,
    timeout: MASTER_IMPORT_UPLOAD_TRANSACTION_TIMEOUT_MS,
  });
  return publicJob(job, input.uploaderDisplayName ?? null);
}

export async function resumeMasterImportJob(input: {
  organizationId: string;
  jobId: string;
  uploadedFileName: string;
  uploadedFileSize: number;
  sourceSha256: string;
}) {
  const uploadedFileName = safeUploadedFileName(input.uploadedFileName);
  if (!/^[a-f0-9]{64}$/.test(input.sourceSha256)) {
    throw new MasterImportServiceError("Workbook integrity fingerprint is invalid.", 400);
  }
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: input.organizationId, id: input.jobId },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);
  if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
  if (job.status !== MasterImportJobStatus.UPLOADING
    || job.uploaded_file_name !== uploadedFileName
    || job.uploaded_file_size !== input.uploadedFileSize
    || job.source_sha256 !== input.sourceSha256) {
    throw new MasterImportServiceError("Selected workbook does not match this incomplete upload.", 409);
  }
  return publicJob(job);
}

export async function saveMasterImportFileChunk(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  chunkIndex: number;
  chunkBytes: Uint8Array;
}) {
  if (!Number.isSafeInteger(input.chunkIndex) || input.chunkIndex < 0) {
    throw new MasterImportServiceError("Workbook chunk number is invalid.", 400);
  }
  if (input.chunkBytes.byteLength < 1 || input.chunkBytes.byteLength > MASTER_IMPORT_UPLOAD_CHUNK_BYTES) {
    throw new MasterImportServiceError("Workbook chunk size is invalid.", 413);
  }
  const sha256 = createHash("sha256").update(input.chunkBytes).digest("hex");
  const encryptedData = Buffer.from(
    encryptSecret(Buffer.from(input.chunkBytes).toString("base64")),
    "utf8",
  );

  return prisma.$transaction(async (transaction) => {
    const job = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!job) throw new MasterImportServiceError("Import job not found.", 404);
    if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
    if (job.status !== MasterImportJobStatus.UPLOADING) {
      throw new MasterImportServiceError("This workbook is no longer accepting upload chunks.", 409);
    }
    if (input.chunkIndex >= job.file_chunk_count) {
      throw new MasterImportServiceError("Workbook chunk number is outside the upload.", 400);
    }
    const expectedBytes = input.chunkIndex === job.file_chunk_count - 1
      ? job.uploaded_file_size - input.chunkIndex * MASTER_IMPORT_UPLOAD_CHUNK_BYTES
      : MASTER_IMPORT_UPLOAD_CHUNK_BYTES;
    if (input.chunkBytes.byteLength !== expectedBytes) {
      throw new MasterImportServiceError("Workbook chunk has an unexpected size.", 400);
    }
    if (input.chunkIndex === 0
      && (input.chunkBytes[0] !== 0x50 || input.chunkBytes[1] !== 0x4b
        || input.chunkBytes[2] !== 0x03 || input.chunkBytes[3] !== 0x04)) {
      throw new MasterImportServiceError("Uploaded file is not a valid .xlsx workbook.", 400);
    }

    const existing = await transaction.masterImportJobFileChunk.findUnique({
      where: {
        organization_id_job_id_chunk_index: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          chunk_index: input.chunkIndex,
        },
      },
      select: { sha256: true, byte_size: true },
    });
    if (existing) {
      if (existing.sha256 !== sha256 || existing.byte_size !== input.chunkBytes.byteLength) {
        throw new MasterImportServiceError("Retry chunk does not match the saved workbook data.", 409);
      }
      return { uploadedFileChunks: job.uploaded_file_chunks };
    }
    if (input.chunkIndex !== job.uploaded_file_chunks) {
      throw new MasterImportServiceError("Upload chunks must be saved in order; resume from the saved progress.", 409);
    }

    await transaction.masterImportJobFileChunk.create({
      data: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        chunk_index: input.chunkIndex,
        byte_size: input.chunkBytes.byteLength,
        sha256,
        encrypted_data: encryptedData,
      },
    });
    const updated = await transaction.masterImportJob.updateMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: MasterImportJobStatus.UPLOADING,
        uploaded_file_chunks: input.chunkIndex,
      },
      data: {
        uploaded_file_chunks: { increment: 1 },
        updated_by_user_id: input.actorUserId,
      },
    });
    if (updated.count !== 1) {
      throw new MasterImportServiceError("Upload progress changed; refresh and resume the upload.", 409);
    }
    return { uploadedFileChunks: input.chunkIndex + 1 };
  }, { maxWait: 10_000, timeout: 20_000 });
}

export async function completeMasterImportFileUpload(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const job = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!job) throw new MasterImportServiceError("Import job not found.", 404);
    if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
    if (job.status === MasterImportJobStatus.UPLOADED) return { job: publicJob(job) };
    if (job.status !== MasterImportJobStatus.UPLOADING
      || job.uploaded_file_chunks !== job.file_chunk_count) {
      throw new MasterImportServiceError("Workbook upload is incomplete. Resume uploading before staging.", 409);
    }
    const chunks = await transaction.masterImportJobFileChunk.findMany({
      where: { organization_id: input.organizationId, job_id: input.jobId },
      orderBy: { chunk_index: "asc" },
      select: { chunk_index: true, byte_size: true },
    });
    if (chunks.length !== job.file_chunk_count
      || chunks.some((chunk, index) => chunk.chunk_index !== index)
      || chunks.reduce((sum, chunk) => sum + chunk.byte_size, 0) !== job.uploaded_file_size) {
      throw new MasterImportServiceError("Uploaded workbook chunks are incomplete or inconsistent.", 409);
    }
    const updated = await transaction.masterImportJob.updateMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: MasterImportJobStatus.UPLOADING,
        uploaded_file_chunks: job.file_chunk_count,
      },
      data: {
        status: MasterImportJobStatus.UPLOADED,
        checkpoint: "UPLOAD_COMPLETED",
        updated_by_user_id: input.actorUserId,
      },
    });
    if (updated.count !== 1) {
      throw new MasterImportServiceError("Upload progress changed; refresh and try again.", 409);
    }
    const savedJob = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!savedJob) throw new MasterImportServiceError("Import job not found.", 404);
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_UPLOAD_COMPLETED",
      entityType: "MasterImportJob",
      entityId: input.jobId,
      details: { fileSize: job.uploaded_file_size, fileChunkCount: job.file_chunk_count },
    }, transaction);
    return { job: publicJob(savedJob) };
  }, { maxWait: 10_000, timeout: 20_000 });
}

export async function getMasterImportJob(
  organizationId: string,
  jobId: string,
  pagination: {
    skip: number;
    take?: number;
    tab: "all" | "staged" | "validated" | "errors" | "created" | "planned";
  } = { skip: 0, tab: "all" },
) {
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: organizationId, id: jobId },
    select: {
      id: true,
      organization_id: true,
      module_key: true,
      status: true,
      uploaded_file_name: true,
      uploaded_file_size: true,
      file_chunk_count: true,
      uploaded_file_chunks: true,
      total_rows: true,
      processed_rows: true,
      successful_rows: true,
      failed_rows: true,
      checkpoint: true,
      created_by_user_id: true,
      updated_by_user_id: true,
      created_at: true,
      updated_at: true,
      staged_at: true,
      validated_at: true,
      started_at: true,
      completed_at: true,
      failed_at: true,
      expires_at: true,
    },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);

  const organizationJobRows = { organization_id: organizationId, job_id: jobId };
  const statusFilter: Prisma.MasterImportJobRowWhereInput["status"] = pagination.tab === "all"
    ? undefined
    : pagination.tab === "created"
      ? MasterImportJobRowStatus.IMPORTED
      : pagination.tab === "validated"
        ? MasterImportJobRowStatus.VALIDATED
        : pagination.tab === "errors"
          ? { in: [MasterImportJobRowStatus.INVALID, MasterImportJobRowStatus.FAILED] }
          : { notIn: [
              MasterImportJobRowStatus.IMPORTED,
              MasterImportJobRowStatus.VALIDATED,
              MasterImportJobRowStatus.INVALID,
              MasterImportJobRowStatus.FAILED,
            ] };
  const [page, groupedRows, unplannedValidatedCount] = await Promise.all([
    pagination.tab === "planned"
      ? Promise.resolve([])
      : prisma.masterImportJobRow.findMany({
          where: {
            ...organizationJobRows,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(pagination.tab === "validated" ? { plan_number: null } : {}),
          },
          orderBy: { row_number: "asc" },
          ...(pagination.tab === "all"
            ? {}
            : { skip: pagination.skip, take: pagination.take }),
          select: {
            row_number: true,
            status: true,
            checkpoint: true,
            encrypted_payload: true,
            updated_at: true,
          },
        }),
    prisma.masterImportJobRow.groupBy({
      by: ["status"],
      where: organizationJobRows,
      _count: { _all: true },
    }),
    prisma.masterImportJobRow.count({
      where: {
        ...organizationJobRows,
        status: MasterImportJobRowStatus.VALIDATED,
        plan_number: null,
      },
    }),
  ]);

  const countForStatus = (status: MasterImportJobRowStatus) =>
    groupedRows.find((group) => group.status === status)?._count._all ?? 0;
  const errorRowCount = countForStatus(MasterImportJobRowStatus.INVALID)
    + countForStatus(MasterImportJobRowStatus.FAILED);
  const createdRowCount = countForStatus(MasterImportJobRowStatus.IMPORTED);
  const allValidatedRowCount = countForStatus(MasterImportJobRowStatus.VALIDATED);
  const validatedRowCount = unplannedValidatedCount ?? allValidatedRowCount;
  const totalRowCount = groupedRows.reduce((count, group) => count + group._count._all, 0);

  const rows = page.map((row) => {
    let payload: unknown;
    try {
      payload = JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))) as unknown;
    } catch {
      throw new MasterImportServiceError("Import row data is unavailable.", 503);
    }
    return {
      rowNumber: row.row_number,
      status: row.status,
      checkpoint: row.checkpoint,
      payload,
      updatedAt: row.updated_at,
    };
  });

  let plans: Array<{
    planNumber: number;
    recordCount: number;
    validatedCount: number;
    importedCount: number;
    errorCount: number;
  }> = [];
  let planCount = 0;
  if (pagination.tab === "planned") {
    const planStatusGroups = await prisma.masterImportJobRow.groupBy({
      by: ["plan_number", "status"],
      where: {
        ...organizationJobRows,
        plan_number: { not: null },
      },
      _count: { _all: true },
    });
    const groupedPlans = new Map<number, {
      recordCount: number;
      validatedCount: number;
      importedCount: number;
      errorCount: number;
    }>();
    for (const group of planStatusGroups) {
      if (group.plan_number === null) continue;
      const planNumber = group.plan_number;
      const plan = groupedPlans.get(planNumber) ?? {
        recordCount: 0,
        validatedCount: 0,
        importedCount: 0,
        errorCount: 0,
      };
      const rowCount = group._count._all;
      plan.recordCount += rowCount;
      if (group.status === MasterImportJobRowStatus.VALIDATED) plan.validatedCount += rowCount;
      else if (group.status === MasterImportJobRowStatus.IMPORTED) plan.importedCount += rowCount;
      else plan.errorCount += rowCount;
      groupedPlans.set(planNumber, plan);
    }
    const allPlans = [...groupedPlans.entries()].map(([planNumber, plan]) => ({
      planNumber,
      ...plan,
    }));
    planCount = allPlans.length;
    plans = allPlans.slice(pagination.skip, pagination.skip + (pagination.take ?? MASTER_IMPORT_REPORT_PAGE_SIZE));
  }

  return {
    job: publicJob(job),
    rows,
    plans,
    planCount,
    rowCounts: {
      staged: totalRowCount - errorRowCount - createdRowCount - allValidatedRowCount,
      validated: validatedRowCount,
      errors: errorRowCount,
      created: createdRowCount,
    },
    rowOffset: pagination.skip,
  };
}

export async function deleteMasterImportJob(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const job = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!job) throw new MasterImportServiceError("Import job not found.", 404);
    if (job.status === MasterImportJobStatus.IMPORTING
      || job.status === MasterImportJobStatus.COMPLETED
      || job.successful_rows > 0) {
      throw new MasterImportServiceError(
        "This import cannot be deleted after master records have started importing.",
        409,
      );
    }

    const importedRow = await transaction.masterImportJobRow.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        status: MasterImportJobRowStatus.IMPORTED,
      },
      select: { row_number: true },
    });
    if (importedRow) {
      throw new MasterImportServiceError(
        "This import cannot be deleted after master records have been created.",
        409,
      );
    }

    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_DELETED",
      entityType: "MasterImportJob",
      entityId: input.jobId,
      details: {
        moduleKey: job.module_key,
        uploadedFileName: job.uploaded_file_name,
        uploadedFileSize: job.uploaded_file_size,
        status: job.status,
        totalRows: job.total_rows,
      },
    }, transaction);

    const deleted = await transaction.masterImportJob.deleteMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: job.status,
        successful_rows: 0,
      },
    });
    if (deleted.count !== 1) {
      throw new MasterImportServiceError(
        "The import changed while it was being deleted. Refresh the history and try again.",
        409,
      );
    }
    return { deleted: true };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function stageMasterImportJob(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
}) {
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: input.organizationId, id: input.jobId },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);
  if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);

  if (job.status === "STAGED") {
    return { job: publicJob(job) };
  }
  if (job.status !== MasterImportJobStatus.UPLOADED) {
    throw new MasterImportServiceError("Finish uploading the workbook before staging it.", 409);
  }

  let workbookBytes: Uint8Array;
  try {
    if (job.encrypted_source_file.byteLength > 0) {
      const encodedWorkbook = decryptSecret(Buffer.from(job.encrypted_source_file).toString("utf8"));
      workbookBytes = new Uint8Array(Buffer.from(encodedWorkbook, "base64"));
    } else {
      const chunks = await prisma.masterImportJobFileChunk.findMany({
        where: { organization_id: input.organizationId, job_id: input.jobId },
        orderBy: { chunk_index: "asc" },
        select: {
          chunk_index: true,
          byte_size: true,
          sha256: true,
          encrypted_data: true,
        },
      });
      if (chunks.length !== job.file_chunk_count) {
        throw new Error("Uploaded workbook chunk count does not match its job.");
      }
      const hash = createHash("sha256");
      const parts: Buffer[] = [];
      let totalBytes = 0;
      for (const [index, chunk] of chunks.entries()) {
        if (chunk.chunk_index !== index) throw new Error("Uploaded workbook chunk sequence is incomplete.");
        const decoded = decryptSecret(Buffer.from(chunk.encrypted_data).toString("utf8"));
        const bytes = Buffer.from(decoded, "base64");
        if (bytes.byteLength !== chunk.byte_size
          || createHash("sha256").update(bytes).digest("hex") !== chunk.sha256) {
          throw new Error("Uploaded workbook chunk integrity check failed.");
        }
        hash.update(bytes);
        totalBytes += bytes.byteLength;
        parts.push(bytes);
      }
      if (totalBytes !== job.uploaded_file_size || hash.digest("hex") !== job.source_sha256) {
        throw new Error("Uploaded workbook integrity check failed.");
      }
      workbookBytes = new Uint8Array(Buffer.concat(parts, totalBytes));
    }
  } catch {
    throw new MasterImportServiceError("Uploaded workbook is unavailable.", 503);
  }
  if (workbookBytes.byteLength !== job.uploaded_file_size) {
    throw new MasterImportServiceError("Uploaded workbook is unavailable.", 503);
  }
  const workbookFile = {
    name: job.uploaded_file_name,
    size: workbookBytes.byteLength,
    arrayBuffer: async () => workbookBytes.slice().buffer,
  } as File;

  const stagedData = job.module_key === "contact"
    ? await parseContactRows(workbookFile)
    : await parseGenericMasterRows(workbookFile, job.module_key);
  if (stagedData.length === 0) {
    throw new MasterImportServiceError("The workbook contains no importable data rows.", 400);
  }
  const invalidRowCount = stagedData.reduce(
    (count, entry) => count + Number(entry.validationErrors.length > 0),
    0,
  );

  const result = await prisma.$transaction(async (transaction) => {
    for (let offset = 0; offset < stagedData.length; offset += MASTER_IMPORT_STAGING_ROW_BATCH_SIZE) {
      const batch = stagedData.slice(offset, offset + MASTER_IMPORT_STAGING_ROW_BATCH_SIZE)
        .map((entry, batchIndex) => ({
          organization_id: input.organizationId,
          job_id: input.jobId,
          row_number: offset + batchIndex + 1,
          status: entry.validationErrors.length
            ? MasterImportJobRowStatus.INVALID
            : MasterImportJobRowStatus.STAGED,
          checkpoint: entry.checkpoint ?? "PARSED",
          encrypted_payload: Buffer.from(encryptSecret(JSON.stringify({
            ...entry.payload,
            validationErrors: entry.validationErrors,
          })), "utf8"),
          updated_by_user_id: input.actorUserId,
        }));
      const inserted = await transaction.masterImportJobRow.createMany({ data: batch });
      if (inserted.count !== batch.length) {
        throw new MasterImportServiceError("The workbook could not be fully staged. Refresh and try again.", 409);
      }
    }
    const now = new Date();
    const updated = await transaction.masterImportJob.updateMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: MasterImportJobStatus.UPLOADED,
      },
      data: {
        status: MasterImportJobStatus.STAGED,
        checkpoint: "STAGED",
        staged_at: now,
        updated_by_user_id: input.actorUserId,
        total_rows: stagedData.length,
        processed_rows: 0,
        successful_rows: 0,
        failed_rows: invalidRowCount,
      },
    });
    if (updated.count !== 1) {
      throw new MasterImportServiceError("Import job changed while staging; reload and try again.", 409);
    }
    const savedJob = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!savedJob) throw new MasterImportServiceError("Import job not found.", 404);
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_STAGED",
      entityType: "MasterImportJob",
      entityId: input.jobId,
      details: {
        rowCount: stagedData.length,
        invalidRowCount,
      },
    }, transaction);
    return savedJob;
  }, {
    maxWait: MASTER_IMPORT_STAGING_TRANSACTION_MAX_WAIT_MS,
    timeout: MASTER_IMPORT_STAGING_TRANSACTION_TIMEOUT_MS,
  });

  return { job: publicJob(result) };
}

type ImportValidationError = { message: string; fieldPaths: string[] };
type StagedPayload = {
  payload: Record<string, unknown>;
  validationErrors: ImportValidationError[];
  checkpoint?: string;
};

async function updateValidatedImportRowsInBulk(
  transaction: Prisma.TransactionClient,
  input: { organizationId: string; jobId: string; actorUserId: string },
  rows: Array<{
    row: { row_number: number; status: MasterImportJobRowStatus };
    validation: { validationErrors: ImportValidationError[] };
    encryptedPayload: Uint8Array<ArrayBuffer>;
    groupingError: boolean;
  }>,
) {
  for (let offset = 0; offset < rows.length; offset += MASTER_IMPORT_VALIDATION_WRITE_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + MASTER_IMPORT_VALIDATION_WRITE_BATCH_SIZE);
    const values = batch.map(({ row, validation, encryptedPayload, groupingError }) => {
      const invalid = validation.validationErrors.length > 0;
      const status = invalid ? MasterImportJobRowStatus.INVALID : MasterImportJobRowStatus.VALIDATED;
      const checkpoint = groupingError
        ? "ARTICLE_MATRIX_CONFLICT"
        : invalid ? "VALIDATION_FAILED" : "VALIDATED";
      return Prisma.sql`(
        ${row.row_number},
        ${row.status}::"MasterImportJobRowStatus",
        ${status}::"MasterImportJobRowStatus",
        ${checkpoint},
        ${encryptedPayload},
        ${input.actorUserId}
      )`;
    });
    const updatedCount = await transaction.$executeRaw(Prisma.sql`
      UPDATE "master_import_job_rows" AS target
      SET
        "status" = batch."next_status",
        "plan_number" = NULL,
        "checkpoint" = batch."checkpoint",
        "encrypted_payload" = batch."encrypted_payload",
        "updated_by_user_id" = batch."updated_by_user_id",
        "updated_at" = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values)}) AS batch(
        "row_number",
        "expected_status",
        "next_status",
        "checkpoint",
        "encrypted_payload",
        "updated_by_user_id"
      )
      WHERE target."organization_id" = ${input.organizationId}
        AND target."job_id" = ${input.jobId}
        AND target."row_number" = batch."row_number"
        AND target."status" = batch."expected_status"
    `);
    if (updatedCount !== batch.length) {
      throw new MasterImportServiceError("Import rows changed during validation; reload and try again.", 409);
    }
  }
}

async function parseGenericMasterRows(file: File, moduleKey: string): Promise<StagedPayload[]> {
  const definition = getMasterDefinition(moduleKey);
  if (!definition || definition.hidden) {
    throw new MasterImportServiceError("Select a valid master module.", 400);
  }
  let parsed;
  try {
    parsed = await parseMasterRecordsWorkbook(file, definition, "stage");
  } catch (error) {
    throw new MasterImportServiceError(
      error instanceof Error ? error.message.slice(0, 500) : "Workbook could not be parsed.",
      400,
    );
  }
  return parsed.map((row) => ({
    payload: { rowNumber: row.rowNumber, code: row.code, description: row.description, fields: row.fields, childRows: row.childRows },
    validationErrors: [],
  }));
}

async function parseContactRows(file: File): Promise<StagedPayload[]> {
  let parsed;
  try {
    parsed = await parseContactWorkbook(file);
  } catch (error) {
    throw new MasterImportServiceError(
      error instanceof Error ? error.message.slice(0, 500) : "Workbook could not be parsed.",
      400,
    );
  }

  const byKey = new Map<string, StagedPayload>();
  for (const contact of parsed.contacts) {
    byKey.set(contact.contactKey, {
      payload: { contactKey: contact.contactKey, input: contact.input },
      validationErrors: [],
    });
  }
  for (const contact of parsed.invalidContacts) {
    byKey.set(contact.contactKey, {
      payload: { contactKey: contact.contactKey, input: contact.input },
      validationErrors: [{ message: contact.message, fieldPaths: contact.fieldPaths }],
    });
  }
  for (const failure of parsed.failures) {
    const existing = byKey.get(failure.contactKey);
    if (existing) {
      existing.validationErrors.push({ message: failure.message, fieldPaths: failure.fieldPaths ?? [] });
    } else {
      byKey.set(failure.contactKey, {
        payload: { contactKey: failure.contactKey },
        validationErrors: [{ message: failure.message, fieldPaths: failure.fieldPaths ?? [] }],
      });
    }
  }
  for (const correction of parsed.corrections) {
    const row = byKey.get(correction.contactKey);
    if (row) {
      const corrections = Array.isArray(row.payload.corrections) ? row.payload.corrections : [];
      row.payload.corrections = [...corrections, correction];
    }
  }
  return [...byKey.entries()]
    .sort(([left], [right]) => {
      const leftNumber = Number(left.match(/\d+$/)?.[0] ?? Number.MAX_SAFE_INTEGER);
      const rightNumber = Number(right.match(/\d+$/)?.[0] ?? Number.MAX_SAFE_INTEGER);
      return leftNumber - rightNumber || left.localeCompare(right);
    })
    .map(([, entry]) => entry);
}

function validateImportPayload(moduleKey: string, value: unknown): {
  payload: Record<string, unknown>;
  validationErrors: ImportValidationError[];
} {
  if (!isRecord(value)) {
    return { payload: {}, validationErrors: [{ message: "Row payload must be an object.", fieldPaths: [] }] };
  }
  const payload = { ...value };
  delete payload.validationErrors;
  if (moduleKey === "contact") {
    try {
      const input = parseContactInput(payload.input) as ContactInput;
      return { payload: { ...payload, input }, validationErrors: [] };
    } catch (error) {
      return {
        payload,
        validationErrors: [{
          message: error instanceof Error ? error.message : "Contact details are invalid.",
          fieldPaths: error instanceof ContactValidationError ? error.fieldPaths : [],
        }],
      };
    }
  }

  const definition = getMasterDefinition(moduleKey);
  if (!definition || definition.hidden) {
    return { payload, validationErrors: [{ message: "Master module is not available.", fieldPaths: [] }] };
  }
  const errors: ImportValidationError[] = [];
  const fields = isRecord(payload.fields) ? payload.fields : {};
  const childRows = isRecord(payload.childRows) ? payload.childRows : {};
  const fieldDefinitions = definition.fields.filter((field) => !field.readOnly);

  for (const key of Object.keys(fields)) {
    if (!(moduleKey === "article" && key === "Size_Prices")
      && !fieldDefinitions.some((field) => field.key === key)) {
      errors.push({ message: "Row contains a field not defined for this master.", fieldPaths: [key] });
    }
  }
  for (const field of fieldDefinitions) {
    const fieldValue = fields[field.key];
    const empty = fieldValue === null || fieldValue === undefined || fieldValue === ""
      || Array.isArray(fieldValue) && fieldValue.length === 0;
    if (field.required && empty) {
      errors.push({ message: `${field.label} is required.`, fieldPaths: [field.key] });
      continue;
    }
    if (field.type === "child-list") {
      const childValue = childRows[field.key];
      if (childValue !== undefined && !Array.isArray(childValue)) {
        errors.push({ message: `${field.label} must contain a list of child rows.`, fieldPaths: [field.key] });
        continue;
      }
      for (const [index, childRow] of (Array.isArray(childValue) ? childValue : []).entries()) {
        if (!isRecord(childRow)) {
          errors.push({
            message: `${field.label} row ${index + 1} must be an object.`,
            fieldPaths: [`${field.key}.${index}`],
          });
          continue;
        }
        for (const childField of field.childFields ?? []) {
          const childValueForField = childRow[childField.key];
          const childEmpty = childValueForField === null || childValueForField === undefined || childValueForField === "";
          const childPath = `${field.key}.${index}.${childField.key}`;
          if (childField.required && childEmpty) {
            errors.push({ message: `${childField.label} is required in ${field.label} row ${index + 1}.`, fieldPaths: [childPath] });
          } else if (!childEmpty && childField.type === "checkbox" && typeof childValueForField !== "boolean") {
            errors.push({ message: `${childField.label} must be TRUE or FALSE.`, fieldPaths: [childPath] });
          } else if (!childEmpty && ["number", "percentage"].includes(childField.type)
            && (typeof childValueForField !== "number" || !Number.isFinite(childValueForField))) {
            errors.push({ message: `${childField.label} must be a valid number.`, fieldPaths: [childPath] });
          } else if (!childEmpty && childField.type === "decimal"
            && !(typeof childValueForField === "string" || typeof childValueForField === "number")
            || !childEmpty && childField.type === "decimal" && !Number.isFinite(Number(childValueForField))) {
            errors.push({ message: `${childField.label} must be a valid decimal.`, fieldPaths: [childPath] });
          } else if (!childEmpty && childField.type === "lookup" && typeof childValueForField !== "string") {
            errors.push({ message: `${childField.label} must be a valid lookup value.`, fieldPaths: [childPath] });
          } else if (!childEmpty && childField.type === "picklist" && childField.options?.length
            && typeof childValueForField === "string"
            && !childField.options.some((option) => option.toLowerCase() === childValueForField.toLowerCase())) {
            errors.push({ message: `${childField.label} must match one of its listed options.`, fieldPaths: [childPath] });
          }
        }
      }
      continue;
    }
    if (empty) continue;
    if (field.type === "checkbox" && typeof fieldValue !== "boolean") {
      errors.push({ message: `${field.label} must be TRUE or FALSE.`, fieldPaths: [field.key] });
    } else if (["number", "percentage"].includes(field.type)
      && (typeof fieldValue !== "number" || !Number.isFinite(fieldValue))) {
      errors.push({ message: `${field.label} must be a valid number.`, fieldPaths: [field.key] });
    } else if (field.type === "percentage"
      && typeof fieldValue === "number" && (fieldValue < 0 || fieldValue > 100)) {
      errors.push({ message: `${field.label} must be between 0 and 100.`, fieldPaths: [field.key] });
    } else if (field.type === "decimal"
      && !(typeof fieldValue === "string" || typeof fieldValue === "number")
      || field.type === "decimal" && !Number.isFinite(Number(fieldValue))) {
      errors.push({ message: `${field.label} must be a valid decimal.`, fieldPaths: [field.key] });
    } else if (field.multiple && field.type === "lookup" && !Array.isArray(fieldValue)) {
      errors.push({ message: `${field.label} must contain a list of values.`, fieldPaths: [field.key] });
    } else if (!field.multiple && field.type === "lookup" && typeof fieldValue !== "string") {
      errors.push({ message: `${field.label} must be a valid lookup value.`, fieldPaths: [field.key] });
    } else if (["text", "picklist", "date", "url", "image"].includes(field.type)
      && typeof fieldValue !== "string") {
      errors.push({ message: `${field.label} has an invalid value.`, fieldPaths: [field.key] });
    }
    if (field.type === "date" && typeof fieldValue === "string" && !isValidImportDate(fieldValue)) {
      errors.push({ message: `${field.label} must be a valid date (YYYY-MM-DD).`, fieldPaths: [field.key] });
    }
    if ((field.type === "url" || field.type === "image") && typeof fieldValue === "string" && fieldValue !== "") {
      try {
        const parsedUrl = new URL(fieldValue);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error("Unsupported protocol.");
      } catch {
        errors.push({ message: `${field.label} must be an http or https URL.`, fieldPaths: [field.key] });
      }
    }
    if (field.type === "picklist" && field.options?.length
      && typeof fieldValue === "string"
      && !field.options.some((option) => option.toLowerCase() === fieldValue.toLowerCase())) {
      errors.push({ message: `${field.label} must match one of its listed options.`, fieldPaths: [field.key] });
    }
  }
  const labelField = fieldDefinitions.find((field) => field.key === (definition.labelField ?? fieldDefinitions[0]?.key));
  const labelValue = labelField ? fields[labelField.key] : null;
  if (typeof labelValue !== "string" || !labelValue.trim()) {
    if (!errors.some((error) => error.fieldPaths.includes(labelField?.key ?? ""))) {
      errors.push({
        message: `${labelField?.label ?? definition.label} is required.`,
        fieldPaths: labelField ? [labelField.key] : [],
      });
    }
  }
  return { payload: { ...payload, fields, childRows }, validationErrors: errors };
}

function toMasterFieldValues(fields: Record<string, unknown>): MasterFieldValues {
  const result: MasterFieldValues = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      result[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
      result[key] = value;
    } else if (Array.isArray(value) && value.every(isRecord)) {
      result[key] = value;
    } else {
      throw new MasterImportServiceError("Master row contains unsupported field data.", 400);
    }
  }
  return result;
}

type ArticleImportLookup = {
  id: string;
  is_active: boolean;
  legacy_metadata: unknown;
};

type ArticleImportSizeGroup = ArticleImportLookup & {
  size_group: string;
  brand_id: string;
};

type ArticleImportSupportingMasterIndex = {
  dummyBatchId: string | null;
  brands: Map<string, ArticleImportLookup & { brand: string }>;
  products: Map<string, ArticleImportLookup & { product_master_name: string }>;
  categories: Map<string, ArticleImportLookup & { category_name: string; product_master_id: string | null }>;
  subcategories: Map<string, ArticleImportLookup & { sub_category: string; category_id: string | null }>;
  colors: Map<string, ArticleImportLookup & { colors: string }>;
  sizes: Map<string, ArticleImportLookup & { size: string }>;
  sizeGroups: Map<string, ArticleImportSizeGroup>;
  existingSizeGroupNames: Set<string>;
  sizeGroupSizeLabelsByGroupId: Map<string, Set<string>>;
  knownMissingSizeGroupNames: Set<string>;
};

type ArticleImportMasterSuggestion = {
  moduleKey: string;
  label: string;
  fields: Record<string, unknown>;
  articleFieldUpdates?: Record<string, unknown>;
};

type ArticleImportDependencyError = ImportValidationError & {
  relatedMasters?: ArticleImportMasterSuggestion[];
};

function normalizedArticleMasterLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function addArticleMasterLabels(target: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim()) target.add(value.trim());
}

async function loadArticleImportSupportingMasterIndex(
  organizationId: string,
  payloads: unknown[],
): Promise<ArticleImportSupportingMasterIndex> {
  const labels = {
    brands: new Set<string>(),
    products: new Set<string>(),
    categories: new Set<string>(),
    subcategories: new Set<string>(),
    colors: new Set<string>(),
    sizes: new Set<string>(),
    sizeGroups: new Set<string>(),
  };
  for (const payload of payloads) {
    if (!isRecord(payload) || !isRecord(payload.fields)) continue;
    addArticleMasterLabels(labels.brands, payload.fields.Brand);
    addArticleMasterLabels(labels.products, payload.fields.Product_Master);
    addArticleMasterLabels(labels.categories, payload.fields.Category);
    addArticleMasterLabels(labels.subcategories, payload.fields.Subcategory);
    addArticleMasterLabels(labels.sizeGroups, payload.fields.Size_Group);
    if (Array.isArray(payload.fields.Sizes)) {
      for (const size of payload.fields.Sizes) addArticleMasterLabels(labels.sizes, size);
    }
    if (isRecord(payload.childRows) && Array.isArray(payload.childRows.variants)) {
      for (const variant of payload.childRows.variants) {
        if (isRecord(variant)) addArticleMasterLabels(labels.colors, variant.color);
      }
    }
  }

  const [dummyBatch, brands, products, categories, subcategories, colors, sizes] = await Promise.all([
    prisma.organizationDummyDataBatch.findFirst({
      where: { organization_id: organizationId, status: "ACTIVE" },
      select: { id: true },
    }),
    labels.brands.size
      ? prisma.masterBrand.findMany({
          where: {
            organization_id: organizationId,
            OR: [...labels.brands].map((brand) => ({ brand: { equals: brand, mode: "insensitive" as const } })),
          },
          select: { id: true, brand: true, is_active: true, legacy_metadata: true },
        })
      : Promise.resolve([]),
    labels.products.size
      ? prisma.masterProduct.findMany({
          where: {
            organization_id: organizationId,
            OR: [...labels.products].map((product) => ({
              product_master_name: { equals: product, mode: "insensitive" as const },
            })),
          },
          select: { id: true, product_master_name: true, is_active: true, legacy_metadata: true },
        })
      : Promise.resolve([]),
    labels.categories.size
      ? prisma.masterCategory.findMany({
          where: {
            organization_id: organizationId,
            OR: [...labels.categories].map((category) => ({
              category_name: { equals: category, mode: "insensitive" as const },
            })),
          },
          select: {
            id: true,
            category_name: true,
            product_master_id: true,
            is_active: true,
            legacy_metadata: true,
          },
        })
      : Promise.resolve([]),
    labels.subcategories.size
      ? prisma.masterSubCategory.findMany({
          where: {
            organization_id: organizationId,
            OR: [...labels.subcategories].map((subcategory) => ({
              sub_category: { equals: subcategory, mode: "insensitive" as const },
            })),
          },
          select: {
            id: true,
            sub_category: true,
            category_id: true,
            is_active: true,
            legacy_metadata: true,
          },
        })
      : Promise.resolve([]),
    labels.colors.size
      ? prisma.masterColor.findMany({
          where: {
            organization_id: organizationId,
            OR: [...labels.colors].map((color) => ({ colors: { equals: color, mode: "insensitive" as const } })),
          },
          select: { id: true, colors: true, is_active: true, legacy_metadata: true },
        })
      : Promise.resolve([]),
    labels.sizes.size
      ? prisma.masterSize.findMany({
          where: {
            organization_id: organizationId,
            OR: [...labels.sizes].map((size) => ({ size: { equals: size, mode: "insensitive" as const } })),
          },
          select: { id: true, size: true, is_active: true, legacy_metadata: true },
        })
      : Promise.resolve([]),
  ]);
  const sizeGroupFilters = [
    ...[...labels.sizeGroups].map((sizeGroup) => ({
      size_group: { equals: sizeGroup, mode: "insensitive" as const },
    })),
    ...(brands.length > 0 ? [{ brand_id: { in: brands.map((brand) => brand.id) } }] : []),
  ];
  const sizeGroups = sizeGroupFilters.length > 0
    ? await prisma.masterSizeGroup.findMany({
        where: { organization_id: organizationId, OR: sizeGroupFilters },
        select: {
          id: true,
          size_group: true,
          brand_id: true,
          is_active: true,
          legacy_metadata: true,
        },
      })
    : [];
  const sizeGroupIds = [...new Set(sizeGroups.map((group) => group.id))];
  const sizeGroupSizeLinks = sizeGroupIds.length > 0
    ? await prisma.masterSizeGroupSize.findMany({
        where: {
          organization_id: organizationId,
          size_group_id: { in: sizeGroupIds },
        },
        select: {
          size_group_id: true,
          size: { select: { organization_id: true, size: true } },
        },
      })
      : [];
  const sizeGroupSizeLabelsByGroupId = new Map<string, Set<string>>();
  for (const link of sizeGroupSizeLinks) {
      if (link.size.organization_id !== organizationId) continue;
      const labels = sizeGroupSizeLabelsByGroupId.get(link.size_group_id) ?? new Set<string>();
      labels.add(normalizedArticleMasterLabel(link.size.size));
      sizeGroupSizeLabelsByGroupId.set(link.size_group_id, labels);
  }

  const indexByLabel = <T extends { [key: string]: unknown }>(
    records: T[],
    key: keyof T,
  ) => {
    const index = new Map<string, T>();
    for (const record of records) {
      const label = normalizedArticleMasterLabel(String(record[key] ?? ""));
      if (!index.has(label)) index.set(label, record);
    }
    return index;
  };
  return {
    dummyBatchId: dummyBatch?.id ?? null,
    brands: indexByLabel(brands, "brand"),
    products: indexByLabel(products, "product_master_name"),
    categories: indexByLabel(categories, "category_name"),
    subcategories: indexByLabel(subcategories, "sub_category"),
    colors: indexByLabel(colors, "colors"),
    sizes: indexByLabel(sizes, "size"),
    sizeGroups: indexByLabel(sizeGroups, "size_group"),
    existingSizeGroupNames: new Set(sizeGroups.map((group) => normalizedArticleMasterLabel(group.size_group))),
    sizeGroupSizeLabelsByGroupId,
    knownMissingSizeGroupNames: new Set(),
  };
}

export async function validateArticleImportSupportingMasters(
  database: Prisma.TransactionClient | typeof prisma,
  organizationId: string,
  fields: Record<string, unknown>,
  childRows: Record<string, unknown>,
  supportingIndex?: ArticleImportSupportingMasterIndex,
) {
  const transaction = database as Prisma.TransactionClient;
  const errors: ArticleImportDependencyError[] = [];
  const suggestions: ArticleImportMasterSuggestion[] = [];
  const dummyBatchId = supportingIndex
    ? supportingIndex.dummyBatchId
    : (await transaction.organizationDummyDataBatch.findFirst({
        where: { organization_id: organizationId, status: "ACTIVE" },
        select: { id: true },
      }))?.id ?? null;
  const findBrand = async (label: string) => transaction.masterBrand.findFirst({
    where: { organization_id: organizationId, brand: { equals: label, mode: "insensitive" } },
    select: { id: true, brand: true, is_active: true, legacy_metadata: true },
  });
  const findProduct = async (label: string) => transaction.masterProduct.findFirst({
    where: { organization_id: organizationId, product_master_name: { equals: label, mode: "insensitive" } },
    select: { id: true, product_master_name: true, is_active: true, legacy_metadata: true },
  });
  const findCategory = async (label: string) => transaction.masterCategory.findFirst({
    where: { organization_id: organizationId, category_name: { equals: label, mode: "insensitive" } },
    select: { id: true, category_name: true, product_master_id: true, is_active: true, legacy_metadata: true },
  });
  const findSubcategory = async (label: string) => transaction.masterSubCategory.findFirst({
    where: { organization_id: organizationId, sub_category: { equals: label, mode: "insensitive" } },
    select: { id: true, sub_category: true, category_id: true, is_active: true, legacy_metadata: true },
  });
  const isUsable = (record: ArticleImportLookup | null, label: string, typeLabel: string) => {
    if (!record) return false;
    if (!record.is_active) {
      errors.push({ message: `${typeLabel} "${label}" exists but is inactive. Activate it before retrying the Article.`, fieldPaths: [] });
      return false;
    }
    if (dummyBatchId && isRecord(record.legacy_metadata)
      && record.legacy_metadata.dummyDataBatchId === dummyBatchId) {
      errors.push({ message: `${typeLabel} "${label}" is demo data and cannot be used for this Article.`, fieldPaths: [] });
      return false;
    }
    return true;
  };
  const addSuggestion = (
    input: ArticleImportMasterSuggestion,
    message: string,
    fieldPaths: string[],
  ) => {
    const key = `${input.moduleKey}:${input.label.toLocaleLowerCase()}`;
    if (!suggestions.some((suggestion) => `${suggestion.moduleKey}:${suggestion.label.toLocaleLowerCase()}` === key)) {
      suggestions.push(input);
    }
    errors.push({ message, fieldPaths, relatedMasters: [input] });
    return true;
  };

  const brandLabel = String(fields.Brand ?? "").trim();
  const brand = brandLabel
    ? supportingIndex
      ? supportingIndex.brands.get(normalizedArticleMasterLabel(brandLabel)) ?? null
      : await findBrand(brandLabel)
    : null;
  if (brandLabel && !brand) {
    addSuggestion(
      { moduleKey: "brand", label: brandLabel, fields: { Brand: brandLabel } },
      `Brand "${brandLabel}" is missing. Create this Brand before retrying the Article.`,
      ["Brand"],
    );
    return { errors, suggestions };
  } else if (brandLabel && !isUsable(brand, brandLabel, "Brand")) return { errors, suggestions };

  const productLabel = String(fields.Product_Master ?? "").trim();
  const product = productLabel
    ? supportingIndex
      ? supportingIndex.products.get(normalizedArticleMasterLabel(productLabel)) ?? null
      : await findProduct(productLabel)
    : null;
  if (productLabel && !product) {
    addSuggestion(
      { moduleKey: "product-master", label: productLabel, fields: { Product_Master_name: productLabel } },
      `Finished Goods Type "${productLabel}" is missing. Create this type before retrying the Article.`,
      ["Product_Master"],
    );
    return { errors, suggestions };
  } else if (productLabel && !isUsable(product, productLabel, "Finished Goods Type")) return { errors, suggestions };

  const categoryLabel = String(fields.Category ?? "").trim();
  const category = categoryLabel
    ? supportingIndex
      ? supportingIndex.categories.get(normalizedArticleMasterLabel(categoryLabel)) ?? null
      : await findCategory(categoryLabel)
    : null;
  if (categoryLabel && !category) {
    if (productLabel) {
      addSuggestion(
        {
          moduleKey: "category",
          label: categoryLabel,
          fields: { Product_Master: productLabel, Category_Name: categoryLabel },
        },
        `Finished Goods Category "${categoryLabel}" is missing for Finished Goods Type "${productLabel}". Create it before retrying the Article.`,
        ["Product_Master", "Category"],
      );
      return { errors, suggestions };
    }
  } else if (categoryLabel && category) {
    if (!isUsable(category, categoryLabel, "Finished Goods Category")) return { errors, suggestions };
    if (product && category.product_master_id !== product.id) {
      errors.push({
        message: `Finished Goods Category "${categoryLabel}" belongs to a different Finished Goods Type than "${productLabel}".`,
        fieldPaths: ["Product_Master", "Category"],
      });
      return { errors, suggestions };
    }
  }

  const subcategoryLabel = String(fields.Subcategory ?? "").trim();
  const subcategory = subcategoryLabel
    ? supportingIndex
      ? supportingIndex.subcategories.get(normalizedArticleMasterLabel(subcategoryLabel)) ?? null
      : await findSubcategory(subcategoryLabel)
    : null;
  if (subcategoryLabel && !subcategory) {
    if (categoryLabel) {
      addSuggestion(
        {
          moduleKey: "sub-category",
          label: subcategoryLabel,
          fields: { category: categoryLabel, sub_category: subcategoryLabel },
        },
        `Finished Goods Subcategory "${subcategoryLabel}" is missing for Finished Goods Category "${categoryLabel}". Create it before retrying the Article.`,
        ["Category", "Subcategory"],
      );
      return { errors, suggestions };
    }
  } else if (subcategoryLabel && subcategory) {
    if (!isUsable(subcategory, subcategoryLabel, "Finished Goods Subcategory")) return { errors, suggestions };
    if (category && subcategory.category_id !== category.id) {
      errors.push({
        message: `Finished Goods Subcategory "${subcategoryLabel}" belongs to a different Finished Goods Category than "${categoryLabel}".`,
        fieldPaths: ["Category", "Subcategory"],
      });
      return { errors, suggestions };
    }
  }

  const variants = Array.isArray(childRows.variants) ? childRows.variants.filter(isRecord) : [];
  const seenColors = new Set<string>();
  for (const variant of variants) {
    const colorLabel = String(variant.color ?? "").trim();
    const key = colorLabel.toLocaleLowerCase();
    if (!colorLabel || seenColors.has(key)) continue;
    seenColors.add(key);
    const color = supportingIndex
      ? supportingIndex.colors.get(normalizedArticleMasterLabel(colorLabel)) ?? null
      : await transaction.masterColor.findFirst({
          where: { organization_id: organizationId, colors: { equals: colorLabel, mode: "insensitive" } },
          select: { id: true, colors: true, is_active: true, legacy_metadata: true },
        });
    if (!color) {
      addSuggestion(
        { moduleKey: "color", label: colorLabel, fields: { Colors: colorLabel } },
        `Color "${colorLabel}" is missing. Create this Color before retrying the Article.`,
        ["variants"],
      );
      return { errors, suggestions };
    } else if (!isUsable(color, colorLabel, "Color")) return { errors, suggestions };
  }

  const sizeLabels = Array.isArray(fields.Sizes)
    ? [...new Set(fields.Sizes.filter((value): value is string => typeof value === "string")
      .map((value) => value.trim()).filter(Boolean))]
    : [];
  const sizes: Array<{ id: string; size: string; is_active: boolean; legacy_metadata: unknown }> = [];
  for (const sizeLabel of sizeLabels) {
    const size = supportingIndex
      ? supportingIndex.sizes.get(normalizedArticleMasterLabel(sizeLabel)) ?? null
      : await transaction.masterSize.findFirst({
          where: { organization_id: organizationId, size: { equals: sizeLabel, mode: "insensitive" } },
          select: { id: true, size: true, is_active: true, legacy_metadata: true },
        });
    if (!size) {
      addSuggestion(
        { moduleKey: "size", label: sizeLabel, fields: { Size: sizeLabel } },
        `Size "${sizeLabel}" is missing. Create this Size before creating or selecting its Size Group.`,
        ["Sizes", "Size_Group"],
      );
      return { errors, suggestions };
    } else if (isUsable(size, sizeLabel, "Size")) sizes.push(size);
    else return { errors, suggestions };
  }

  const requestedGroupLabel = String(fields.Size_Group ?? "").trim();
  if (sizeLabels.length > 0) {
    const requestedGroup = requestedGroupLabel
      ? supportingIndex
        ? supportingIndex.sizeGroups.get(normalizedArticleMasterLabel(requestedGroupLabel)) ?? null
        : await transaction.masterSizeGroup.findFirst({
            where: { organization_id: organizationId, size_group: { equals: requestedGroupLabel, mode: "insensitive" } },
            select: { id: true, size_group: true, brand_id: true, is_active: true, legacy_metadata: true },
          })
      : null;
    const requiredSizeLabels = new Set(sizeLabels.map(normalizedArticleMasterLabel));
    let groupsForBrand: ArticleImportSizeGroup[] = [];
    if (brand) {
      groupsForBrand = supportingIndex
        ? [...supportingIndex.sizeGroups.values()].filter((group) => group.brand_id === brand.id)
        : await transaction.masterSizeGroup.findMany({
            where: { organization_id: organizationId, brand_id: brand.id },
            select: { id: true, size_group: true, brand_id: true, is_active: true, legacy_metadata: true },
          });
    }
    const groupIsSelectable = (group: ArticleImportSizeGroup) => group.is_active
      && !(dummyBatchId && isRecord(group.legacy_metadata)
        && group.legacy_metadata.dummyDataBatchId === dummyBatchId);
    const groupHasExactSizes = (group: ArticleImportSizeGroup, linkedSizeLabels: Set<string>) =>
      linkedSizeLabels.size === requiredSizeLabels.size
      && [...requiredSizeLabels].every((size) => linkedSizeLabels.has(size));
    let exactGroups: ArticleImportSizeGroup[] = [];
    if (supportingIndex) {
      const hasExactSizes = (group: ArticleImportSizeGroup) => groupHasExactSizes(
        group,
        supportingIndex.sizeGroupSizeLabelsByGroupId.get(group.id) ?? new Set<string>(),
      );
      exactGroups = groupsForBrand.filter(hasExactSizes);
    } else if (groupsForBrand.length > 0) {
      const allGroupLinks = await transaction.masterSizeGroupSize.findMany({
        where: {
          organization_id: organizationId,
          size_group_id: { in: groupsForBrand.map((group) => group.id) },
        },
        select: {
          size_group_id: true,
          size: { select: { organization_id: true, size: true } },
        },
      });
      const linksByGroupId = new Map<string, Set<string>>();
      for (const link of allGroupLinks) {
        if (link.size.organization_id !== organizationId) continue;
        const linkedSizeLabels = linksByGroupId.get(link.size_group_id) ?? new Set<string>();
        linkedSizeLabels.add(normalizedArticleMasterLabel(link.size.size));
        linksByGroupId.set(link.size_group_id, linkedSizeLabels);
      }
      const hasExactSizes = (group: ArticleImportSizeGroup) => groupHasExactSizes(
        group,
        linksByGroupId.get(group.id) ?? new Set<string>(),
      );
      exactGroups = groupsForBrand.filter(hasExactSizes);
    }
    const requestedExactGroup = requestedGroup
      && requestedGroup.brand_id === brand?.id
      && exactGroups.some((group) => group.id === requestedGroup.id)
      ? requestedGroup
      : null;
    const matchingGroup = requestedExactGroup && groupIsSelectable(requestedExactGroup)
      ? requestedExactGroup
      : exactGroups.find(groupIsSelectable) ?? null;
    if (matchingGroup) {
      fields.Size_Group = matchingGroup.size_group;
      return { errors, suggestions };
    }
    const unavailableExactGroup = requestedExactGroup ?? exactGroups[0];
    if (unavailableExactGroup) {
      isUsable(unavailableExactGroup, unavailableExactGroup.size_group, "Size Group");
      return { errors, suggestions };
    }
    if (requestedGroup
      && requestedGroup.brand_id === brand?.id
      && !groupIsSelectable(requestedGroup)) {
      isUsable(requestedGroup, requestedGroupLabel, "Size Group");
      return { errors, suggestions };
    }
    {
      const sizeNames = sizes.length === sizeLabels.length ? sizes.map((size) => size.size) : sizeLabels;
      const candidatePrefix = requestedGroupLabel && !requestedGroupLabel.includes(",")
        ? requestedGroupLabel
        : brandLabel;
      let suggestedLabel = requestedGroup
        ? `${candidatePrefix} ${sizeNames.join("-")}`.trim()
        : requestedGroupLabel && !requestedGroupLabel.includes(",")
          ? requestedGroupLabel
          : `${brandLabel} ${sizeNames.join("-")}`.trim();
      if (!suggestedLabel) suggestedLabel = `SIZE GROUP ${sizeNames.join("-")}`;
      let suffix = 2;
      while (await (async () => {
        if (!supportingIndex) {
          return Boolean(await transaction.masterSizeGroup.findFirst({
            where: { organization_id: organizationId, size_group: { equals: suggestedLabel, mode: "insensitive" } },
            select: { id: true },
          }));
        }
        const key = normalizedArticleMasterLabel(suggestedLabel);
        if (supportingIndex.existingSizeGroupNames.has(key)) return true;
        if (supportingIndex.knownMissingSizeGroupNames.has(key)) return false;
        const existing = await transaction.masterSizeGroup.findFirst({
          where: { organization_id: organizationId, size_group: { equals: suggestedLabel, mode: "insensitive" } },
          select: { id: true },
        });
        if (existing) supportingIndex.existingSizeGroupNames.add(key);
        else supportingIndex.knownMissingSizeGroupNames.add(key);
        return Boolean(existing);
      })()) {
        suggestedLabel = `${candidatePrefix || `SIZE GROUP ${sizeNames.join("-")}`} ${suffix++}`;
      }
      const groupSuggestion: ArticleImportMasterSuggestion = {
        moduleKey: "size-group",
        label: suggestedLabel,
        fields: { Brand1: brandLabel, Size_Group: suggestedLabel, Size: sizeLabels },
        articleFieldUpdates: { Size_Group: suggestedLabel },
      };
      addSuggestion(
        groupSuggestion,
        requestedGroup
          ? `Size Group "${requestedGroupLabel}" does not contain every required size (${sizeLabels.join(", ")}). Create a Size Group "${suggestedLabel}" for Brand "${brandLabel}" containing all of those sizes, then retry the Article.`
          : `No organization Size Group contains every required size (${sizeLabels.join(", ")}). Create Size Group "${suggestedLabel}" for Brand "${brandLabel}" containing all of those sizes, then retry the Article.`,
        ["Size_Group", "Sizes", "Brand"],
      );
      return { errors, suggestions };
    }
  }

  return { errors, suggestions };
}

async function validateImportPayloadForOrganization(
  organizationId: string,
  moduleKey: string,
  value: unknown,
  lookupIndex?: ActiveMasterLookupIndex,
  articleSupportingIndex?: ArticleImportSupportingMasterIndex,
) {
  const validation = validateImportPayload(moduleKey, value);
  if (moduleKey === "contact") return validation;
  const definition = getMasterDefinition(moduleKey);
  if (!definition || !isRecord(validation.payload.fields)) return validation;
  const index = lookupIndex ?? await loadActiveMasterLookupIndex(
    organizationId,
    getImportLookupModuleKeys(definition.fields),
  );

  const fields = validation.payload.fields;
  const errors: ArticleImportDependencyError[] = [...validation.validationErrors];
  const masterLookupErrors: ArticleImportDependencyError[] = [];
  for (const field of definition.fields) {
    if (!field.lookupModuleKey && field.type !== "child-list") continue;
    if (field.type === "child-list") {
      const childRows = isRecord(validation.payload.childRows)
        && Array.isArray(validation.payload.childRows[field.key])
        ? validation.payload.childRows[field.key] as unknown[]
        : [];
      for (const [rowIndex, childRow] of childRows.entries()) {
        if (!isRecord(childRow)) continue;
        for (const childField of field.childFields ?? []) {
          if (childField.type !== "lookup" || !childField.lookupModuleKey) continue;
          const childValue = childRow[childField.key];
          if (childValue === null || childValue === undefined || childValue === "") continue;
          if (typeof childValue !== "string") continue;
          if (moduleKey === "article" && field.key === "variants" && childField.key === "color") continue;
          if (!isActiveMasterLookupInIndex(index, childField.lookupModuleKey, childValue)) {
            masterLookupErrors.push({
              message: `${childField.label} must match an active value in this organization.`,
              fieldPaths: [`${field.key}.${rowIndex}.${childField.key}`],
            });
          }
        }
      }
      continue;
    }
    if (!field.lookupModuleKey) continue;
    if (moduleKey === "article"
      && ["Brand", "Product_Master", "Category", "Subcategory", "Size_Group", "Sizes"].includes(field.key)) {
      continue;
    }
    const rawValue = fields[field.key];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const values = field.multiple
      ? Array.isArray(rawValue) ? rawValue : []
      : [rawValue];
    if (field.dependsOn) {
      const parentValue = fields[field.dependsOn];
      if (parentValue === null || parentValue === undefined || parentValue === "") {
        masterLookupErrors.push({
          message: `${field.label} must be linked to ${definition.fields.find((candidate) => candidate.key === field.dependsOn)?.label ?? "its parent field"}.`,
          fieldPaths: [field.dependsOn, field.key],
        });
        continue;
      }
    }
    for (const selectedValue of values) {
      if (typeof selectedValue !== "string") continue;
      const parentField = field.dependsOn
        ? definition.fields.find((candidate) => candidate.key === field.dependsOn)
        : undefined;
      const parentModuleKey = parentField?.type === "lookup" ? parentField.lookupModuleKey : undefined;
      const parentLookupValue = field.dependsOn ? String(fields[field.dependsOn]) : undefined;
      const isValid = isActiveMasterLookupInIndex(
        index,
        field.lookupModuleKey,
        selectedValue,
        parentModuleKey,
        parentLookupValue,
      );
      if (!isValid) {
        masterLookupErrors.push({
          message: `${field.label} must match an active value in this organization${field.dependsOn ? " and its selected parent" : ""}.`,
          fieldPaths: field.dependsOn ? [field.key, field.dependsOn] : [field.key],
        });
      }
    }
  }
  if (masterLookupErrors.length > 0) {
    return { ...validation, validationErrors: [...errors, ...masterLookupErrors] };
  }
  if (moduleKey === "article") {
    if (fields.Category && !fields.Product_Master) {
      errors.push({
        message: "Finished Goods Type is required when a Finished Goods Category is provided.",
        fieldPaths: ["Product_Master", "Category"],
      });
    }
    if (fields.Subcategory && !fields.Category) {
      errors.push({
        message: "Finished Goods Category is required when a Finished Goods Subcategory is provided.",
        fieldPaths: ["Category", "Subcategory"],
      });
    }
    const dependencyValidation = await validateArticleImportSupportingMasters(
      prisma,
      organizationId,
      fields,
      isRecord(validation.payload.childRows) ? validation.payload.childRows : {},
      articleSupportingIndex,
    );
    errors.push(...dependencyValidation.errors);
  }
  return { ...validation, validationErrors: errors };
}

function getImportLookupModuleKeys(fields: Array<{
  type: string;
  lookupModuleKey?: string;
  dependsOn?: string;
  key: string;
  childFields?: Array<{ type: string; lookupModuleKey?: string }>;
}>) {
  const moduleKeys = new Set<string>();
  for (const field of fields) {
    if (field.lookupModuleKey) moduleKeys.add(field.lookupModuleKey);
    if (field.type === "child-list") {
      for (const childField of field.childFields ?? []) {
        if (childField.lookupModuleKey) moduleKeys.add(childField.lookupModuleKey);
      }
    }
    if (field.dependsOn) {
      const parent = fields.find((candidate) => candidate.key === field.dependsOn);
      if (parent?.lookupModuleKey) moduleKeys.add(parent.lookupModuleKey);
    }
  }
  return moduleKeys;
}

export async function getMasterImportCommitLookupIndex(
  organizationId: string,
  jobId: string,
): Promise<ActiveMasterLookupIndex | undefined> {
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: organizationId, id: jobId },
    select: { module_key: true, expires_at: true },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);
  if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
  if (job.module_key === "contact") return undefined;

  const definition = getMasterDefinition(job.module_key);
  if (!definition) return undefined;
  return loadActiveMasterLookupIndex(
    organizationId,
    getImportLookupModuleKeys(definition.fields),
  );
}

export async function getMasterImportValidationContext(
  organizationId: string,
  jobId: string,
): Promise<{ moduleKey: string; lookupIndex?: ActiveMasterLookupIndex }> {
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: organizationId, id: jobId },
    select: { module_key: true, expires_at: true },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);
  if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
  if (job.module_key === "contact" || job.module_key === "article") {
    return { moduleKey: job.module_key };
  }

  const definition = getMasterDefinition(job.module_key);
  if (!definition) return { moduleKey: job.module_key };
  return {
    moduleKey: job.module_key,
    lookupIndex: await loadActiveMasterLookupIndex(
      organizationId,
      getImportLookupModuleKeys(definition.fields),
    ),
  };
}

export async function validateMasterImportJob(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  rowNumbers?: number[];
  rowNumber?: number;
  take?: number;
  lookupIndex?: ActiveMasterLookupIndex;
  runProgress?: { runId: string; expectedProgress: number };
}) {
  const selectionCount = [input.rowNumber, input.rowNumbers, input.take]
    .filter((selection) => selection !== undefined).length;
  if (selectionCount > 1) {
    throw new MasterImportServiceError("Select one row-validation request at a time.", 400);
  }
  if (input.rowNumber !== undefined
    && (!Number.isSafeInteger(input.rowNumber) || input.rowNumber < 1)) {
    throw new MasterImportServiceError("Selected row number is invalid.", 400);
  }
  if (input.take !== undefined
    && (!Number.isSafeInteger(input.take) || input.take < 1
      || input.take > MASTER_IMPORT_VALIDATION_BATCH_SIZE)) {
    throw new MasterImportServiceError("Validation batch size is invalid.", 400);
  }
  if (selectionCount === 0) {
    throw new MasterImportServiceError("Select at least one row awaiting validation.", 400);
  }
  if (input.rowNumbers !== undefined
    && (input.rowNumbers.length < 1
      || input.rowNumbers.length > MASTER_IMPORT_VALIDATION_BATCH_SIZE
      || new Set(input.rowNumbers).size !== input.rowNumbers.length
      || input.rowNumbers.some((rowNumber) => !Number.isSafeInteger(rowNumber) || rowNumber < 1))) {
    throw new MasterImportServiceError("Selected row numbers are invalid.", 400);
  }
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: input.organizationId, id: input.jobId },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);
  if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
  if (!["STAGED", "VALIDATED", "PARTIAL"].includes(job.status)) {
    throw new MasterImportServiceError("This import cannot be validated at its current stage.", 409);
  }

  const selectedRows = await prisma.masterImportJobRow.findMany({
    where: {
      organization_id: input.organizationId,
      job_id: input.jobId,
      status: { in: input.take === undefined
        ? ["STAGED", "CORRECTED", "INVALID", "FAILED"]
        : ["STAGED", "CORRECTED"] },
      ...(input.rowNumber !== undefined
        ? { row_number: input.rowNumber }
        : input.rowNumbers !== undefined ? { row_number: { in: input.rowNumbers } } : {}),
    },
    orderBy: { row_number: "asc" },
    take: input.take ?? input.rowNumbers?.length ?? 1,
  });
  const requestedRowCount = input.take ?? input.rowNumbers?.length ?? 1;
  if (input.take === undefined && job.module_key !== "article" && selectedRows.length !== requestedRowCount) {
    throw new MasterImportServiceError("One or more selected rows are no longer awaiting validation.", 409);
  }
  type ValidationCandidate = {
    row: (typeof selectedRows)[number];
    payload: unknown;
    groupingError?: ImportValidationError;
    rowsToDelete?: (typeof selectedRows)[number][];
  };
  let candidates: ValidationCandidate[] = selectedRows.map((row) => {
    let payload: unknown;
    try {
      payload = JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))) as unknown;
    } catch {
      throw new MasterImportServiceError("Import row data is unavailable.", 503);
    }
    return { row, payload };
  });
  if (job.module_key === "article" && selectedRows.length > 0) {
    const selectedArticleKeys = new Set(candidates.flatMap(({ payload }) =>
      isRecord(payload) && isRecord(payload.fields) && typeof payload.fields.article === "string"
        ? [payload.fields.article.trim().toLocaleLowerCase()]
        : []));
    const allPendingArticleRows = await prisma.masterImportJobRow.findMany({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        status: { in: input.take === undefined
          ? [
              MasterImportJobRowStatus.STAGED,
              MasterImportJobRowStatus.CORRECTED,
              MasterImportJobRowStatus.INVALID,
              MasterImportJobRowStatus.FAILED,
            ]
          : [MasterImportJobRowStatus.STAGED, MasterImportJobRowStatus.CORRECTED] },
      },
      orderBy: { row_number: "asc" },
    });
    const rowsByArticle = new Map<string, Array<{
      row: (typeof allPendingArticleRows)[number];
      payload: Record<string, unknown>;
    }>>();
    for (const row of allPendingArticleRows) {
      let payload: unknown;
      try {
        payload = JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))) as unknown;
      } catch {
        throw new MasterImportServiceError("Import row data is unavailable.", 503);
      }
      if (!isRecord(payload) || !isRecord(payload.fields) || typeof payload.fields.article !== "string") continue;
      const articleKey = payload.fields.article.trim().toLocaleLowerCase();
      if (!selectedArticleKeys.has(articleKey)) continue;
      const articleRows = rowsByArticle.get(articleKey) ?? [];
      articleRows.push({ row, payload });
      rowsByArticle.set(articleKey, articleRows);
    }

    const groupedCandidates: ValidationCandidate[] = [];
    const selectedRowsWithoutArticle = candidates.filter(({ payload }) =>
      !isRecord(payload) || !isRecord(payload.fields) || typeof payload.fields.article !== "string"
      || !payload.fields.article.trim());
    for (const articleRows of rowsByArticle.values()) {
      const workbookRows = articleRows.flatMap(({ payload }) => {
        if (!isRecord(payload.fields) || typeof payload.rowNumber !== "number"
          || !isRecord(payload.childRows)) return [];
        return [{
          rowNumber: payload.rowNumber,
          code: typeof payload.code === "string" ? payload.code : null,
          description: typeof payload.description === "string" ? payload.description : null,
          fields: payload.fields,
          childRows: payload.childRows as Record<string, Record<string, unknown>[] | string>,
        }];
      });
      if (workbookRows.length !== articleRows.length) {
        throw new MasterImportServiceError("Article row data is invalid; correct the row and retry.", 400);
      }
      const grouped = groupArticleMatrixRowsWithErrors(workbookRows);
      const rowByWorkbookNumber = new Map(articleRows.map(({ row, payload }) =>
        [Number(payload.rowNumber), row]));
      const groupingFailure = grouped.failures[0];
      if (groupingFailure) {
        for (const { row, payload } of articleRows) {
          const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "validationErrors"));
          groupedCandidates.push({
            row,
            payload: {
              ...cleanPayload,
              validationErrors: [{
                message: groupingFailure.message,
                fieldPaths: groupingFailure.fieldPaths,
              }],
            },
            groupingError: {
              message: groupingFailure.message,
              fieldPaths: groupingFailure.fieldPaths,
            },
          });
        }
      } else {
        const groupedRow = grouped.rows[0];
        const primaryRow = rowByWorkbookNumber.get(groupedRow.rowNumber);
        if (!primaryRow) {
          throw new MasterImportServiceError("Article grouping could not identify its source row.", 409);
        }
        const duplicates = articleRows
          .filter(({ row }) => row.id !== primaryRow.id)
          .map(({ row }) => row);
        groupedCandidates.push({
          row: primaryRow,
          payload: {
            rowNumber: groupedRow.rowNumber,
            code: groupedRow.code,
            description: groupedRow.description,
            fields: groupedRow.fields,
            childRows: groupedRow.childRows,
          },
          rowsToDelete: duplicates,
        });
      }
    }
    candidates = [...groupedCandidates, ...selectedRowsWithoutArticle];
  }
  const importDefinition = getMasterDefinition(job.module_key);
  const lookupIndex = input.lookupIndex ?? (candidates.length === 0
    || job.module_key === "contact"
    || job.module_key === "article"
    || !importDefinition
    ? new Map<string, Map<string, ActiveMasterLookupRecord[]>>()
    : await loadActiveMasterLookupIndex(
        input.organizationId,
        getImportLookupModuleKeys(importDefinition.fields),
      ));
  const validationResults: Array<{
    row: (typeof selectedRows)[number];
    validation: Awaited<ReturnType<typeof validateImportPayloadForOrganization>>;
    encryptedPayload: Uint8Array<ArrayBuffer>;
    rowsToDelete: (typeof selectedRows)[number][];
    groupingError: boolean;
  }> = [];
  const auditEvents: Prisma.AuditEventCreateManyInput[] = [];
  const articleSupportingIndex = job.module_key === "article" && candidates.length > 0
    ? await loadArticleImportSupportingMasterIndex(
        input.organizationId,
        candidates.map(({ payload }) => payload),
      )
    : undefined;
  for (const candidate of candidates) {
    const validation = candidate.groupingError
      ? {
          payload: Object.fromEntries(Object.entries(candidate.payload as Record<string, unknown>)
            .filter(([key]) => key !== "validationErrors")),
          validationErrors: [candidate.groupingError],
        }
      : await validateImportPayloadForOrganization(
          input.organizationId,
          job.module_key,
          candidate.payload,
          lookupIndex,
          articleSupportingIndex,
        );
    const encryptedPayload = new Uint8Array(Buffer.from(encryptSecret(JSON.stringify({
      ...validation.payload,
      validationErrors: validation.validationErrors,
    })), "utf8"));
    validationResults.push({
      row: candidate.row,
      validation,
      encryptedPayload,
      rowsToDelete: candidate.rowsToDelete ?? [],
      groupingError: Boolean(candidate.groupingError),
    });
  }
  const useBulkRowUpdates = validationResults.length > MASTER_IMPORT_VALIDATION_BULK_WRITE_THRESHOLD;

  const result = await prisma.$transaction(async (transaction) => {
    for (const { row, validation, encryptedPayload, rowsToDelete, groupingError } of validationResults) {
      if (rowsToDelete.length > 0) {
        const deleted = await transaction.masterImportJobRow.deleteMany({
          where: {
            organization_id: input.organizationId,
            job_id: input.jobId,
            id: { in: rowsToDelete.map((duplicate) => duplicate.id) },
            status: { in: rowsToDelete.map((duplicate) => duplicate.status) },
          },
        });
        if (deleted.count !== rowsToDelete.length) {
          throw new MasterImportServiceError("Article rows changed during validation; reload and retry.", 409);
        }
        for (const duplicate of rowsToDelete) {
          auditEvents.push({
            organization_id: input.organizationId,
            user_id: input.actorUserId,
            module: "MASTER_DATA",
            action: "MASTER_IMPORT_ARTICLE_ROWS_CONSOLIDATED",
            entity_type: "MasterImportJobRow",
            entity_id: duplicate.id,
            details: {
              jobId: input.jobId,
              rowNumber: duplicate.row_number,
              consolidatedIntoRowId: row.id,
              consolidatedIntoRowNumber: row.row_number,
            },
          });
        }
      }
      if (!useBulkRowUpdates) {
        const updated = await transaction.masterImportJobRow.updateMany({
          where: {
            organization_id: input.organizationId,
            job_id: input.jobId,
            row_number: row.row_number,
            status: row.status,
          },
          data: {
            status: validation.validationErrors.length
              ? MasterImportJobRowStatus.INVALID
              : MasterImportJobRowStatus.VALIDATED,
            plan_number: null,
            checkpoint: groupingError
              ? "ARTICLE_MATRIX_CONFLICT"
              : validation.validationErrors.length ? "VALIDATION_FAILED" : "VALIDATED",
            encrypted_payload: encryptedPayload,
            updated_by_user_id: input.actorUserId,
          },
        });
        if (updated.count !== 1) {
          throw new MasterImportServiceError("Import row changed during validation; reload and try again.", 409);
        }
      }
      auditEvents.push({
        organization_id: input.organizationId,
        user_id: input.actorUserId,
        module: "MASTER_DATA",
        action: validation.validationErrors.length
          ? "MASTER_IMPORT_ROW_INVALID"
          : "MASTER_IMPORT_ROW_VALIDATED",
        entity_type: "MasterImportJobRow",
        entity_id: row.id,
        details: {
          jobId: input.jobId,
          rowNumber: row.row_number,
          status: validation.validationErrors.length ? "INVALID" : "VALIDATED",
          fieldPaths: validation.validationErrors.flatMap((error) => error.fieldPaths),
        },
      });
    }
    if (useBulkRowUpdates) {
      await updateValidatedImportRowsInBulk(transaction, input, validationResults);
    }
    if (auditEvents.length > 0) {
      await transaction.auditEvent.createMany({ data: auditEvents });
    }
    const counts = await getRowCounts(transaction, input.organizationId, input.jobId);
    const hasPendingValidation = (counts.counts.get(MasterImportJobRowStatus.STAGED) ?? 0) > 0
      || (counts.counts.get(MasterImportJobRowStatus.CORRECTED) ?? 0) > 0
      || (counts.counts.get(MasterImportJobRowStatus.FAILED) ?? 0) > 0;
    const hasInvalid = (counts.counts.get(MasterImportJobRowStatus.INVALID) ?? 0) > 0
      || (counts.counts.get(MasterImportJobRowStatus.FAILED) ?? 0) > 0;
    const hasImportedRows = (counts.counts.get(MasterImportJobRowStatus.IMPORTED) ?? 0) > 0;
    const status = hasPendingValidation
      ? MasterImportJobStatus.STAGED
      : hasInvalid || hasImportedRows
        ? MasterImportJobStatus.PARTIAL
        : MasterImportJobStatus.VALIDATED;
    const updated = await transaction.masterImportJob.updateMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: job.status,
      },
      data: {
        status,
        validated_at: hasPendingValidation ? null : new Date(),
        updated_by_user_id: input.actorUserId,
        checkpoint: hasPendingValidation
          ? "VALIDATION_PENDING"
          : hasInvalid
            ? "VALIDATED_WITH_ERRORS"
            : "VALIDATED",
        total_rows: counts.total_rows,
        processed_rows: counts.processed_rows,
        successful_rows: counts.successful_rows,
        failed_rows: counts.failed_rows,
      },
    });
    if (updated.count !== 1) {
      throw new MasterImportServiceError("Import job changed during validation; reload and retry.", 409);
    }
    const savedJob = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!savedJob) throw new MasterImportServiceError("Import job not found.", 404);
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_VALIDATED",
      entityType: "MasterImportJob",
      entityId: input.jobId,
      details: { status, failedRows: counts.failed_rows },
    }, transaction);
    if (input.runProgress) {
      const checkpoint = await transaction.masterImportRun.updateMany({
        where: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          id: input.runProgress.runId,
          status: "RUNNING",
          progress: input.runProgress.expectedProgress,
        },
        data: {
          progress: { increment: selectedRows.length },
          lease_expires_at: new Date(Date.now() + MASTER_IMPORT_RUN_LEASE_SECONDS * 1_000),
          updated_at: new Date(),
        },
      });
      if (checkpoint.count !== 1) {
        throw new MasterImportServiceError("Validation progress changed; retry the background operation.", 409);
      }
    }
    return { savedJob, counts };
  }, {
    maxWait: MASTER_IMPORT_STAGING_TRANSACTION_MAX_WAIT_MS,
    timeout: MASTER_IMPORT_STAGING_TRANSACTION_TIMEOUT_MS,
  });

  const hasMore = result.savedJob.status === MasterImportJobStatus.STAGED
    && Boolean(await prisma.masterImportJobRow.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        status: { in: input.take === undefined
          ? ["STAGED", "CORRECTED", "INVALID", "FAILED"]
          : ["STAGED", "CORRECTED"] },
        ...(input.take !== undefined ? {} : input.rowNumber !== undefined
          ? { row_number: input.rowNumber }
          : input.rowNumbers !== undefined ? { row_number: { in: input.rowNumbers } } : {}),
      },
      select: { row_number: true },
      orderBy: { row_number: "asc" },
    }));
  return {
    job: publicJob(result.savedJob),
    validatedRowNumbers: validationResults
      .filter(({ validation }) => validation.validationErrors.length === 0)
      .map(({ row }) => row.row_number),
    progress: {
      totalRows: result.counts.total_rows,
      processedRows: result.counts.processed_rows,
      successfulRows: result.counts.successful_rows,
      failedRows: result.counts.failed_rows,
      validatedRows: (result.counts.counts.get(MasterImportJobRowStatus.VALIDATED) ?? 0)
        + (result.counts.counts.get(MasterImportJobRowStatus.IMPORTED) ?? 0),
    },
    processedRowCount: selectedRows.length,
    hasMore,
  };
}

export async function createMasterImportPlans(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  rowNumbers?: number[];
}) {
  if (input.rowNumbers !== undefined
    && (input.rowNumbers.length < 1
      || input.rowNumbers.length > MASTER_IMPORT_PLAN_SIZE
      || new Set(input.rowNumbers).size !== input.rowNumbers.length
      || input.rowNumbers.some((rowNumber) => !Number.isSafeInteger(rowNumber) || rowNumber < 1))) {
    throw new MasterImportServiceError("Selected plan rows are invalid.", 400);
  }
  const createdPlans = await prisma.$transaction(async (transaction) => {
    const now = new Date();
    const lockedJob = await transaction.masterImportJob.updateMany({
      where: { organization_id: input.organizationId, id: input.jobId },
      data: { updated_at: now, updated_by_user_id: input.actorUserId },
    });
    if (lockedJob.count !== 1) throw new MasterImportServiceError("Import job not found.", 404);

    const job = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
      select: { id: true, status: true, expires_at: true, next_plan_number: true },
    });
    if (!job) throw new MasterImportServiceError("Import job not found.", 404);
    if (job.expires_at <= now) throw new MasterImportServiceError("Import job has expired.", 410);
    if (job.status === MasterImportJobStatus.UPLOADED || job.status === MasterImportJobStatus.FAILED) {
      throw new MasterImportServiceError("Stage and validate this import before creating plans.", 409);
    }

    let nextPlanNumber = job.next_plan_number;
    const plans: Array<{ planNumber: number; recordCount: number }> = [];

    const rows = await transaction.masterImportJobRow.findMany({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        status: MasterImportJobRowStatus.VALIDATED,
        plan_number: null,
        ...(input.rowNumbers ? { row_number: { in: input.rowNumbers } } : {}),
      },
      orderBy: { row_number: "asc" },
      select: { row_number: true },
    });
    for (let offset = 0; offset < rows.length; offset += MASTER_IMPORT_PLAN_SIZE) {
      const planRows = rows.slice(offset, offset + MASTER_IMPORT_PLAN_SIZE);
      const assigned = await transaction.masterImportJobRow.updateMany({
        where: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          row_number: { in: planRows.map((row) => row.row_number) },
          status: MasterImportJobRowStatus.VALIDATED,
          plan_number: null,
        },
        data: {
          plan_number: nextPlanNumber,
          updated_by_user_id: input.actorUserId,
        },
      });
      if (assigned.count > 0) {
        plans.push({ planNumber: nextPlanNumber, recordCount: assigned.count });
        nextPlanNumber += 1;
      }
    }

    if (plans.length > 0) {
      const counterUpdate = await transaction.masterImportJob.updateMany({
        where: { organization_id: input.organizationId, id: input.jobId },
        data: {
          next_plan_number: nextPlanNumber,
          updated_at: new Date(),
          updated_by_user_id: input.actorUserId,
        },
      });
      if (counterUpdate.count !== 1) {
        throw new MasterImportServiceError("Import plan counter changed; reload and retry.", 409);
      }
      await createAuditEvent({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        module: "MASTER_DATA",
        action: "MASTER_IMPORT_PLANS_CREATED",
        entityType: "MasterImportJob",
        entityId: input.jobId,
        details: { plans },
      }, transaction);
    }
    return plans;
  }, {
    maxWait: MASTER_IMPORT_STAGING_TRANSACTION_MAX_WAIT_MS,
    timeout: MASTER_IMPORT_STAGING_TRANSACTION_TIMEOUT_MS,
  });

  return {
    plans: createdPlans,
    planCount: createdPlans.length,
    plannedRowCount: createdPlans.reduce((count, plan) => count + plan.recordCount, 0),
  };
}

export async function getValidatedMasterImportPlanRows(
  organizationId: string,
  jobId: string,
  planNumber: number,
) {
  if (!Number.isSafeInteger(planNumber) || planNumber < 1) {
    throw new MasterImportServiceError("Import plan number is invalid.", 400);
  }
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: organizationId, id: jobId },
    select: { id: true, expires_at: true },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);
  if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);

  const rows = await prisma.masterImportJobRow.findMany({
    where: {
      organization_id: organizationId,
      job_id: jobId,
      plan_number: planNumber,
      status: MasterImportJobRowStatus.VALIDATED,
    },
    orderBy: { row_number: "asc" },
    take: MASTER_IMPORT_PLAN_BATCH_SIZE,
    select: { row_number: true },
  });
  return rows.map((row) => row.row_number);
}

export async function getMasterImportPlanProgress(
  organizationId: string,
  jobId: string,
  planNumber: number,
) {
  if (!Number.isSafeInteger(planNumber) || planNumber < 1) {
    throw new MasterImportServiceError("Import plan number is invalid.", 400);
  }
  const job = await prisma.masterImportJob.findFirst({
    where: { organization_id: organizationId, id: jobId },
    select: { id: true, expires_at: true },
  });
  if (!job) throw new MasterImportServiceError("Import job not found.", 404);
  if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);

  const statuses = await prisma.masterImportJobRow.groupBy({
    by: ["status"],
    where: {
      organization_id: organizationId,
      job_id: jobId,
      plan_number: planNumber,
    },
    _count: { _all: true },
  });
  const countForStatus = (status: MasterImportJobRowStatus) =>
    statuses.find((group) => group.status === status)?._count._all ?? 0;
  const validatedCount = countForStatus(MasterImportJobRowStatus.VALIDATED);
  const importedCount = countForStatus(MasterImportJobRowStatus.IMPORTED);
  const errorCount = countForStatus(MasterImportJobRowStatus.INVALID)
    + countForStatus(MasterImportJobRowStatus.FAILED);

  return {
    recordCount: statuses.reduce((count, group) => count + group._count._all, 0),
    validatedCount,
    importedCount,
    errorCount,
  };
}

export async function commitNextMasterImportRow(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  rowNumber?: number;
  lookupIndex?: ActiveMasterLookupIndex;
}) {
  if (input.rowNumber !== undefined
    && (!Number.isSafeInteger(input.rowNumber) || input.rowNumber < 1)) {
    throw new MasterImportServiceError("Selected row number is invalid.", 400);
  }
  let attemptedRowNumber: number | null = null;
  try {
    return await prisma.$transaction(async (transaction) => {
      const job = await transaction.masterImportJob.findFirst({
        where: { organization_id: input.organizationId, id: input.jobId },
      });
      if (!job) throw new MasterImportServiceError("Import job not found.", 404);
      if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
      if (!["VALIDATED", "IMPORTING", "PARTIAL", "COMPLETED"].includes(job.status)
        && !(job.status === "STAGED" && input.rowNumber !== undefined)) {
        throw new MasterImportServiceError("Validate this import before committing rows.", 409);
      }
      if (job.status === "COMPLETED") {
        if (input.rowNumber !== undefined) {
          throw new MasterImportServiceError("The selected row is no longer available to import.", 409);
        }
        const counts = await getRowCounts(transaction, input.organizationId, input.jobId);
        return commitProgress(job, counts, null);
      }

      const row = await transaction.masterImportJobRow.findFirst({
        where: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          status: MasterImportJobRowStatus.VALIDATED,
          ...(input.rowNumber !== undefined ? { row_number: input.rowNumber } : {}),
        },
        orderBy: { row_number: "asc" },
      });
      if (!row) {
        if (input.rowNumber !== undefined) {
          throw new MasterImportServiceError("The selected row is no longer validated for import.", 409);
        }
        const counts = await getRowCounts(transaction, input.organizationId, input.jobId);
        const unresolvedRows = groupedNonTerminalRowCount(counts.counts);
        const rowsAwaitingValidation = await transaction.masterImportJobRow.findFirst({
          where: {
            organization_id: input.organizationId,
            job_id: input.jobId,
            status: { in: ["STAGED", "CORRECTED", "PENDING"] },
          },
          select: { row_number: true },
        });
        if (rowsAwaitingValidation) {
          throw new MasterImportServiceError("Validate staged or corrected rows before continuing the import.", 409);
        }
        if (job.status === "PARTIAL" && unresolvedRows > 0) {
          return commitProgress(job, counts, null);
        }
        if (unresolvedRows > 0) {
          throw new MasterImportServiceError("Resolve staged or invalid rows with the validate endpoint before committing.", 409);
        }
        const status = counts.failed_rows > 0
          ? MasterImportJobStatus.PARTIAL
          : MasterImportJobStatus.COMPLETED;
        const updated = await transaction.masterImportJob.updateMany({
          where: { organization_id: input.organizationId, id: input.jobId, status: job.status },
          data: {
            status,
            completed_at: new Date(),
            updated_by_user_id: input.actorUserId,
            checkpoint: status === MasterImportJobStatus.COMPLETED ? "COMPLETED" : "PARTIAL",
            total_rows: counts.total_rows,
            processed_rows: counts.processed_rows,
            successful_rows: counts.successful_rows,
            failed_rows: counts.failed_rows,
          },
        });
        if (updated.count !== 1) throw new MasterImportServiceError("Import job changed; reload and retry.", 409);
        const completedJob = await transaction.masterImportJob.findFirst({
          where: { organization_id: input.organizationId, id: input.jobId },
        });
        if (!completedJob) throw new MasterImportServiceError("Import job not found.", 404);
        await createAuditEvent({
          organizationId: input.organizationId,
          userId: input.actorUserId,
          module: "MASTER_DATA",
          action: "MASTER_IMPORT_COMMIT_COMPLETED",
          entityType: "MasterImportJob",
          entityId: input.jobId,
          details: { status, successfulRows: counts.successful_rows, failedRows: counts.failed_rows },
        }, transaction);
        return commitProgress(completedJob, counts, null);
      }

      attemptedRowNumber = row.row_number;
      let storedPayload: unknown;
      try {
        storedPayload = JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))) as unknown;
      } catch {
        throw new MasterImportServiceError("Import row data is unavailable.", 503);
      }
      if (!isRecord(storedPayload)) {
        throw new MasterImportServiceError("Import row data is invalid.", 400);
      }
      const validation = job.module_key === "contact"
        ? { payload: storedPayload, validationErrors: [] }
        : await validateImportPayloadForOrganization(
            input.organizationId,
            job.module_key,
            storedPayload,
            input.lookupIndex,
          );
      const encryptedPayload = Buffer.from(encryptSecret(JSON.stringify({
        ...validation.payload,
        validationErrors: validation.validationErrors,
      })), "utf8");
      if (validation.validationErrors.length) {
        const invalid = await transaction.masterImportJobRow.updateMany({
          where: {
            organization_id: input.organizationId,
            job_id: input.jobId,
            row_number: row.row_number,
            status: MasterImportJobRowStatus.VALIDATED,
          },
          data: {
            status: MasterImportJobRowStatus.INVALID,
            checkpoint: "COMMIT_REVALIDATION_FAILED",
            encrypted_payload: encryptedPayload,
            updated_by_user_id: input.actorUserId,
          },
        });
        if (invalid.count !== 1) throw new MasterImportServiceError("Import row changed; reload and retry.", 409);
        const counts = await getRowCounts(transaction, input.organizationId, input.jobId);
        await transaction.masterImportJob.updateMany({
          where: { organization_id: input.organizationId, id: input.jobId, status: job.status },
          data: {
            status: MasterImportJobStatus.STAGED,
            checkpoint: "VALIDATION_ERRORS",
            validated_at: null,
            failed_rows: counts.failed_rows,
            processed_rows: counts.processed_rows,
            successful_rows: counts.successful_rows,
            total_rows: counts.total_rows,
            updated_by_user_id: input.actorUserId,
          },
        });
        await createAuditEvent({
          organizationId: input.organizationId,
          userId: input.actorUserId,
          module: "MASTER_DATA",
          action: "MASTER_IMPORT_ROW_INVALID",
          entityType: "MasterImportJobRow",
          entityId: row.id,
          details: {
            jobId: input.jobId,
            rowNumber: row.row_number,
            fieldPaths: validation.validationErrors.flatMap((error) => error.fieldPaths),
          },
        }, transaction);
        return {
          ...commitProgress({ ...job, status: MasterImportJobStatus.STAGED }, counts, null),
          validationRequired: true,
        };
      }

      const keepValidating = job.status === MasterImportJobStatus.STAGED && input.rowNumber !== undefined;
      if (job.status !== "IMPORTING" && !keepValidating) {
        const started = await transaction.masterImportJob.updateMany({
          where: { organization_id: input.organizationId, id: input.jobId, status: job.status },
          data: {
            status: MasterImportJobStatus.IMPORTING,
            started_at: job.started_at ?? new Date(),
            checkpoint: `COMMIT_ROW_${row.row_number}`,
            updated_by_user_id: input.actorUserId,
          },
        });
        if (started.count !== 1) throw new MasterImportServiceError("Import job changed; reload and retry.", 409);
        if (job.status === "VALIDATED") {
          await createAuditEvent({
            organizationId: input.organizationId,
            userId: input.actorUserId,
            module: "MASTER_DATA",
            action: "MASTER_IMPORT_COMMIT_STARTED",
            entityType: "MasterImportJob",
            entityId: input.jobId,
            details: { totalRows: job.total_rows },
          }, transaction);
        }
      }

      if (job.module_key === "contact") {
        await createContact(
          input.organizationId,
          input.actorUserId,
          validation.payload.input,
          transaction,
        );
      } else {
        const definition = getMasterDefinition(job.module_key);
        const fields = validation.payload.fields;
        if (!definition || !isRecord(fields)) {
          throw new MasterImportServiceError("Master row data is invalid.", 400);
        }
        const labelField = definition.labelField ?? definition.fields.find((field) => !field.readOnly)?.key;
        const label = labelField ? fields[labelField] : null;
        if (typeof label !== "string" || !label.trim()) {
          throw new MasterImportServiceError("Master row label is invalid.", 400);
        }
        const masterFields = toMasterFieldValues(fields);
        const importedChildRows = isRecord(validation.payload.childRows)
          ? validation.payload.childRows
          : {};
        if (job.module_key === "article") {
          const dependencies = await validateArticleImportSupportingMasters(
            transaction,
            input.organizationId,
            fields,
            importedChildRows,
          );
          if (dependencies.errors.length > 0) {
            throw new MasterImportServiceError(dependencies.errors[0].message, 409);
          }
        }
        await createMasterValueForOrganization(input.organizationId, job.module_key, {
          label,
          code: typeof validation.payload.code === "string" ? validation.payload.code : null,
          description: typeof validation.payload.description === "string" ? validation.payload.description : null,
          fields: masterFields,
          ...(job.module_key !== "article" ? { lookupIndex: input.lookupIndex } : {}),
          childRows: Object.fromEntries(Object.entries(importedChildRows).map(([key, rows]) => [
                key,
                Array.isArray(rows) ? rows.filter(isRecord) : [],
              ])),
          ...(job.module_key === "article"
            && Array.isArray(importedChildRows.variants)
            ? {
                articleVariants: importedChildRows.variants
                  .filter(isRecord)
                  .map((childFields) => ({ fields: childFields })),
              }
            : {}),
          ...(job.module_key === "article" && Array.isArray(masterFields.Sizes)
            ? { articleSizes: masterFields.Sizes.filter((value): value is string => typeof value === "string") }
            : {}),
          ...(job.module_key === "article"
            ? { articleSizePrices: parseFinishedGoodsSizePrices(masterFields.Size_Prices ?? []) }
            : {}),
          createOnly: true,
        }, transaction);
      }

      const updatedRow = await transaction.masterImportJobRow.updateMany({
        where: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          row_number: row.row_number,
          status: MasterImportJobRowStatus.VALIDATED,
        },
        data: {
          status: MasterImportJobRowStatus.IMPORTED,
          checkpoint: "IMPORTED",
          encrypted_payload: encryptedPayload,
          updated_by_user_id: input.actorUserId,
        },
      });
      if (updatedRow.count !== 1) {
        throw new MasterImportServiceError("Import row changed during commit; its business write was rolled back.", 409);
      }

      const unresolvedRow = await transaction.masterImportJobRow.findFirst({
        where: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          status: { notIn: [...TERMINAL_ROW_STATUSES] },
        },
        select: { row_number: true },
      });
      const terminal = unresolvedRow === null;
      const counts = {
        total_rows: job.total_rows,
        processed_rows: job.processed_rows + 1,
        successful_rows: job.successful_rows + 1,
        failed_rows: job.failed_rows,
      };
      const validationPending = keepValidating
        ? await transaction.masterImportJobRow.findFirst({
            where: {
              organization_id: input.organizationId,
              job_id: input.jobId,
              status: { in: ["STAGED", "CORRECTED", "PENDING", "FAILED"] },
            },
            select: { row_number: true },
          })
        : null;
      const nextStatus = keepValidating && validationPending
        ? MasterImportJobStatus.STAGED
        : terminal
        ? counts.failed_rows > 0
          ? MasterImportJobStatus.PARTIAL
          : MasterImportJobStatus.COMPLETED
        : counts.failed_rows > 0 && counts.successful_rows > 0
          ? MasterImportJobStatus.PARTIAL
          : MasterImportJobStatus.IMPORTING;
      const updatedJob = await transaction.masterImportJob.updateMany({
        where: {
          organization_id: input.organizationId,
          id: input.jobId,
          status: keepValidating ? MasterImportJobStatus.STAGED : MasterImportJobStatus.IMPORTING,
        },
        data: {
          status: nextStatus,
          checkpoint: `ROW_${row.row_number}_IMPORTED`,
          completed_at: terminal ? new Date() : null,
          updated_by_user_id: input.actorUserId,
          total_rows: counts.total_rows,
          processed_rows: counts.processed_rows,
          successful_rows: counts.successful_rows,
          failed_rows: counts.failed_rows,
        },
      });
      if (updatedJob.count !== 1) throw new MasterImportServiceError("Import job changed; reload and retry.", 409);
      if (terminal) {
        await createAuditEvent({
          organizationId: input.organizationId,
          userId: input.actorUserId,
          module: "MASTER_DATA",
          action: "MASTER_IMPORT_COMMIT_COMPLETED",
          entityType: "MasterImportJob",
          entityId: input.jobId,
          details: { status: nextStatus, successfulRows: counts.successful_rows, failedRows: counts.failed_rows },
        }, transaction);
      }
      const savedJob = await transaction.masterImportJob.findFirst({
        where: { organization_id: input.organizationId, id: input.jobId },
      });
      if (!savedJob) throw new MasterImportServiceError("Import job not found.", 404);
      return commitProgress(savedJob, counts, {
        rowNumber: row.row_number,
        status: MasterImportJobRowStatus.IMPORTED,
        checkpoint: "IMPORTED",
      });
    }, {
      maxWait: MASTER_IMPORT_COMMIT_TRANSACTION_MAX_WAIT_MS,
      timeout: MASTER_IMPORT_COMMIT_TRANSACTION_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof MasterImportServiceError) throw error;
    const failure = attemptedRowNumber === null
      ? null
      : await markMasterImportRowCommitFailed({ ...input, rowNumber: attemptedRowNumber }, error);
    if (failure) return failure;
    throw error;
  }
}

function commitProgress(
  job: Parameters<typeof publicJob>[0],
  counts: Pick<Awaited<ReturnType<typeof getRowCounts>>, "total_rows" | "processed_rows" | "successful_rows" | "failed_rows">,
  row: { rowNumber: number; status: MasterImportJobRowStatus; checkpoint: string } | null,
) {
  return {
    job: publicJob(job),
    progress: {
      totalRows: counts.total_rows,
      processedRows: counts.processed_rows,
      successfulRows: counts.successful_rows,
      failedRows: counts.failed_rows,
    },
    row,
  };
}

export function formatMasterImportCommitFailure(error: unknown) {
  const errorCode = error && typeof error === "object" && "code" in error
    && typeof error.code === "string" && /^P\d{4}$/.test(error.code)
    ? error.code
    : null;

  if (error instanceof Error && error.name === "ContactValidationError") {
    return "Contact data must be corrected before retrying.";
  }
  if (errorCode === "P2028") {
    return "The database transaction could not be completed. No master changes were saved; validate this row and retry.";
  }
  if (errorCode === "P2002") {
    return "This row conflicts with an existing master record. Check for a duplicate Article, Brand, Color, Size, or code.";
  }
  if (errorCode === "P2003" || errorCode === "P2014") {
    return "A linked master could not be saved. Check that Brand, category, subcategory, Size Group, and sizes belong together.";
  }
  if (errorCode === "P2000") {
    return "A value exceeds the allowed field length. Shorten the affected value and retry.";
  }
  if (errorCode === "P2011" || errorCode === "P2012") {
    return "A required value is missing. Review the Article and variant fields and retry.";
  }
  if (errorCode === "P2025") {
    return "A linked master changed or was removed during import. Refresh the row and validate it again.";
  }
  if (errorCode === "P2021" || errorCode === "P2022") {
    return "The database schema is not ready for this import. Contact your administrator.";
  }
  if (errorCode) {
    return `The database rejected this row (${errorCode}). Review the row and contact your administrator if it repeats.`;
  }
  if (error instanceof Error && error.name === "Error" && error.message.trim()) {
    return error.message.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  }
  return "The record was not saved. Review the row and retry; if the issue repeats, contact your administrator.";
}

async function markMasterImportRowCommitFailed(
  input: { organizationId: string; actorUserId: string; jobId: string; rowNumber: number },
  error: unknown,
) {
  return prisma.$transaction(async (transaction) => {
    const row = await transaction.masterImportJobRow.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        row_number: input.rowNumber,
        status: MasterImportJobRowStatus.VALIDATED,
      },
    });
    if (!row) return null;
    let payload: Record<string, unknown>;
    try {
      const decoded = JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))) as unknown;
      if (!isRecord(decoded)) throw new Error("Stored import row is not an object.");
      payload = decoded;
    } catch {
      throw new MasterImportServiceError("Import row data is unavailable; the original row was preserved.", 503);
    }
    const errorCode = error && typeof error === "object" && "code" in error
      && typeof error.code === "string" && /^P\d{4}$/.test(error.code)
      ? error.code
      : null;
    console.error("Master import row commit failed.", {
      jobId: input.jobId,
      rowNumber: input.rowNumber,
      code: errorCode ?? "UNEXPECTED",
    });
    const message = formatMasterImportCommitFailure(error);
    payload.validationErrors = [{ message, fieldPaths: [] }];
    const updated = await transaction.masterImportJobRow.updateMany({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        row_number: row.row_number,
        status: MasterImportJobRowStatus.VALIDATED,
      },
      data: {
        status: MasterImportJobRowStatus.FAILED,
        checkpoint: "COMMIT_FAILED",
        encrypted_payload: Buffer.from(encryptSecret(JSON.stringify(payload)), "utf8"),
        updated_by_user_id: input.actorUserId,
      },
    });
    if (updated.count !== 1) return null;
    const counts = await getRowCounts(transaction, input.organizationId, input.jobId);
    const existingJob = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
      select: { status: true },
    });
    if (!existingJob || !["STAGED", "VALIDATED", "IMPORTING", "PARTIAL"].includes(existingJob.status)) {
      return null;
    }
    const nextStatus = existingJob.status === MasterImportJobStatus.STAGED
      ? MasterImportJobStatus.STAGED
      : MasterImportJobStatus.PARTIAL;
    const jobUpdate = await transaction.masterImportJob.updateMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: existingJob.status,
      },
      data: {
        status: nextStatus,
        checkpoint: nextStatus === MasterImportJobStatus.STAGED ? "VALIDATION_PENDING" : "COMMIT_ROW_FAILED",
        failed_rows: counts.failed_rows,
        processed_rows: counts.processed_rows,
        successful_rows: counts.successful_rows,
        total_rows: counts.total_rows,
        updated_by_user_id: input.actorUserId,
      },
    });
    if (jobUpdate.count !== 1) {
      throw new MasterImportServiceError("Import status changed while recording the failed row; reload before retrying.", 409);
    }
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_ROW_COMMIT_FAILED",
      entityType: "MasterImportJobRow",
      entityId: row.id,
      details: { jobId: input.jobId, rowNumber: row.row_number },
    }, transaction);
    const job = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!job) return null;
    return commitProgress(job, counts, {
      rowNumber: row.row_number,
      status: MasterImportJobRowStatus.FAILED,
      checkpoint: "COMMIT_FAILED",
    });
  });
}

const ALLOWED_JOB_TRANSITIONS: Record<string, MasterImportJobStatusValue[] | undefined> = {
  UPLOADED: ["STAGED", "FAILED"],
  STAGED: ["VALIDATED", "FAILED"],
  VALIDATED: ["IMPORTING", "FAILED"],
  IMPORTING: ["PARTIAL", "COMPLETED", "FAILED"],
  PARTIAL: ["IMPORTING", "COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

const TERMINAL_ROW_STATUSES = ["IMPORTED", "FAILED", "SKIPPED"] as const;

async function getRowCounts(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  jobId: string,
) {
  const groupedRows = await transaction.masterImportJobRow.groupBy({
    by: ["status"],
    where: { organization_id: organizationId, job_id: jobId },
    _count: { _all: true },
  });
  const counts = new Map(groupedRows.map(({ status, _count }) => [status, _count._all]));
  const totalRows = groupedRows.reduce((sum, item) => sum + item._count._all, 0);
  const processedRows = groupedRows.reduce((sum, item) =>
    sum + (["IMPORTED", "FAILED", "SKIPPED"].includes(item.status) ? item._count._all : 0),
  0);
  return {
    total_rows: totalRows,
    processed_rows: processedRows,
    successful_rows: counts.get(MasterImportJobRowStatus.IMPORTED) ?? 0,
    failed_rows: (counts.get(MasterImportJobRowStatus.INVALID) ?? 0) + (counts.get(MasterImportJobRowStatus.FAILED) ?? 0),
    counts,
  };
}

export async function transitionMasterImportJob(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  status: unknown;
  checkpoint?: unknown;
}) {
  if (!isJobStatus(input.status)) {
    throw new MasterImportServiceError("Select a valid import status.", 400);
  }
  const checkpoint = input.checkpoint;
  if (checkpoint !== undefined && !isCheckpoint(checkpoint)) {
    throw new MasterImportServiceError("Checkpoint must be a short identifier using letters, numbers, dots, underscores, colons, or hyphens.", 400);
  }

  const nextStatus = input.status;
  if (["IMPORTING", "PARTIAL", "COMPLETED"].includes(nextStatus)) {
    throw new MasterImportServiceError(
      "Import execution is unavailable until business-row writes and durable checkpoints can commit atomically.",
      409,
    );
  }
  const job = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!existing) throw new MasterImportServiceError("Import job not found.", 404);
    if (existing.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
    if (!ALLOWED_JOB_TRANSITIONS[existing.status]?.includes(nextStatus)) {
      throw new MasterImportServiceError("This import status transition is not allowed.", 409);
    }

    const counts = await getRowCounts(transaction, input.organizationId, input.jobId);
    if (nextStatus === "STAGED" && counts.total_rows === 0) {
      throw new MasterImportServiceError("Stage at least one workbook row before continuing.", 409);
    }
    if (nextStatus === "VALIDATED" && (
      (counts.counts.get(MasterImportJobRowStatus.PENDING) ?? 0) > 0
      || (counts.counts.get(MasterImportJobRowStatus.STAGED) ?? 0) > 0
      || (counts.counts.get(MasterImportJobRowStatus.INVALID) ?? 0) > 0
    )) {
      throw new MasterImportServiceError("Resolve pending rows before validating this import.", 409);
    }
    if (nextStatus === "IMPORTING" && (
      counts.failed_rows > 0
      || (counts.counts.get(MasterImportJobRowStatus.PENDING) ?? 0) > 0
      || (counts.counts.get(MasterImportJobRowStatus.STAGED) ?? 0) > 0
      || (counts.counts.get(MasterImportJobRowStatus.INVALID) ?? 0) > 0
    )) {
      throw new MasterImportServiceError("Resolve all pending, staged, invalid, or failed rows before importing.", 409);
    }
    if (nextStatus === "COMPLETED" && (counts.counts.get(MasterImportJobRowStatus.IMPORTED) ?? 0) +
      (counts.counts.get(MasterImportJobRowStatus.SKIPPED) ?? 0) !== counts.total_rows) {
      throw new MasterImportServiceError("All rows must be imported or skipped before completion.", 409);
    }
    if (nextStatus === "PARTIAL" && (
      counts.failed_rows === 0
      || counts.successful_rows === 0
      || groupedNonTerminalRowCount(counts.counts) > 0
    )) {
      throw new MasterImportServiceError("A partial import requires both successful and failed rows, with no rows left in progress.", 409);
    }

    const now = new Date();
    const result = await transaction.masterImportJob.updateMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: existing.status,
      },
      data: {
        status: nextStatus,
        updated_by_user_id: input.actorUserId,
        ...(checkpoint !== undefined ? { checkpoint } : {}),
        ...(nextStatus === "STAGED" ? { staged_at: now } : {}),
        ...(nextStatus === "VALIDATED" ? { validated_at: now } : {}),
        ...(nextStatus === "IMPORTING" ? { started_at: now } : {}),
        ...(nextStatus === "COMPLETED" || nextStatus === "PARTIAL" ? { completed_at: now } : {}),
        ...(nextStatus === "FAILED" ? { failed_at: now } : {}),
        total_rows: counts.total_rows,
        processed_rows: counts.processed_rows,
        successful_rows: counts.successful_rows,
        failed_rows: counts.failed_rows,
      },
    });
    if (result.count !== 1) throw new MasterImportServiceError("Import status changed; reload and try again.", 409);
    const updated = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
    });
    if (!updated) throw new MasterImportServiceError("Import job not found.", 404);
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: nextStatus === "VALIDATED" ? "MASTER_IMPORT_VALIDATED" : "MASTER_IMPORT_STATUS_CHANGED",
      entityType: "MasterImportJob",
      entityId: input.jobId,
      details: {
        fromStatus: existing.status,
        toStatus: nextStatus,
        checkpoint: checkpoint ?? null,
      },
    }, transaction);
    return updated;
  });

  return publicJob(job);
}

function getValidationErrorFingerprint(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.validationErrors)) return "";
  const normalized = value.validationErrors
    .map((error) => {
      if (!isRecord(error) || typeof error.message !== "string") return "";
      const fieldPaths = Array.isArray(error.fieldPaths)
        ? error.fieldPaths
            .filter((path): path is string => typeof path === "string")
            .map((path) => path.trim())
            .filter(Boolean)
            .sort()
        : [];
      return JSON.stringify({
        message: error.message.trim(),
        fieldPaths,
      });
    })
    .filter(Boolean)
    .sort()
    .join("||");
  return normalized;
}

async function findMatchingValidationRowsForRevalidation(
  organizationId: string,
  jobId: string,
  rowNumber: number,
  previousPayload: unknown,
) {
  const fingerprint = getValidationErrorFingerprint(previousPayload);
  if (!fingerprint) return [] as Array<{ rowNumber: number; payload: unknown }>;

  const rows = await prisma.masterImportJobRow.findMany({
    where: {
      organization_id: organizationId,
      job_id: jobId,
      status: { in: [MasterImportJobRowStatus.INVALID, MasterImportJobRowStatus.FAILED] },
      row_number: { not: rowNumber },
    },
    select: {
      row_number: true,
      encrypted_payload: true,
    },
  });

  const matchingRows = rows.flatMap((row): Array<{ rowNumber: number; payload: unknown }> => {
      try {
        const payload = JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))) as unknown;
        return getValidationErrorFingerprint(payload) === fingerprint
          ? [{ rowNumber: row.row_number, payload }]
          : [];
      } catch {
        return [];
      }
    });
  return [...new Map(matchingRows.map((row) => [row.rowNumber, row])).values()];
}

export async function saveMasterImportRow(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  rowNumber: number;
  payload: unknown;
  deferMatchingRevalidation?: boolean;
  relatedSizeGroupUpdate?: { name: string; sizes: string[] };
}) {
  if (!Number.isSafeInteger(input.rowNumber) || input.rowNumber < 1) {
    throw new MasterImportServiceError("Row number must be a positive integer.", 400);
  }
  if (!isRecord(input.payload)) {
    throw new MasterImportServiceError("Import row correction is invalid.", 400);
  }
  if (input.relatedSizeGroupUpdate
    && (!input.deferMatchingRevalidation
      || typeof input.relatedSizeGroupUpdate.name !== "string"
      || !input.relatedSizeGroupUpdate.name.trim()
      || !Array.isArray(input.relatedSizeGroupUpdate.sizes)
      || input.relatedSizeGroupUpdate.sizes.length === 0
      || input.relatedSizeGroupUpdate.sizes.some((size) => typeof size !== "string" || !size.trim()))) {
    throw new MasterImportServiceError("Related Size Group correction is invalid.", 400);
  }
  const correctedPayload = { ...input.payload };
  delete correctedPayload.validationErrors;
  const jobForNormalization = await prisma.masterImportJob.findFirst({
    where: { organization_id: input.organizationId, id: input.jobId },
    select: { module_key: true },
  });
  if (!jobForNormalization) throw new MasterImportServiceError("Import job not found.", 404);
  if (jobForNormalization.module_key === "contact" && isRecord(correctedPayload.input)) {
    const contact = correctedPayload.input;
    correctedPayload.input = {
      ...contact,
      ...(["legalName", "displayName", "email"].reduce<Record<string, string>>((normalized, key) => {
        if (typeof contact[key] === "string") normalized[key] = normalizeUppercase(contact[key] as string);
        return normalized;
      }, {})),
      ...(Array.isArray(contact.roles)
        ? { roles: contact.roles.map((role) => typeof role === "string" ? normalizeUppercase(role) : role) }
        : {}),
      ...(Array.isArray(contact.taxRegistrations)
        ? { taxRegistrations: contact.taxRegistrations.map((entry) => normalizeRecordStrings(entry)) }
        : {}),
      ...(Array.isArray(contact.addresses)
        ? { addresses: contact.addresses.map((entry) => normalizeRecordStrings(entry)) }
        : {}),
      ...(Array.isArray(contact.bankAccounts)
        ? { bankAccounts: contact.bankAccounts.map((entry) => normalizeRecordStrings(entry)) }
        : {}),
    };
  } else if (isRecord(correctedPayload.fields)) {
    const definition = getMasterDefinition(jobForNormalization.module_key);
    const fields = { ...correctedPayload.fields };
    for (const field of definition?.fields ?? []) {
      if (!["text", "picklist", "lookup"].includes(field.type)) continue;
      const value = fields[field.key];
      const normalizeFieldValue = (item: unknown) => {
        if (typeof item !== "string") return item;
        if (field.type === "lookup" && isMasterIdentifier(item)) return item;
        return normalizeUppercase(item);
      };
      fields[field.key] = Array.isArray(value)
        ? value.map(normalizeFieldValue)
        : normalizeFieldValue(value);
    }
    correctedPayload.fields = fields;
    if (isRecord(correctedPayload.childRows)) {
      const childRows = { ...correctedPayload.childRows };
      for (const childField of definition?.fields ?? []) {
        if (childField.type !== "child-list") continue;
        const childRowsForField = childRows[childField.key];
        if (!Array.isArray(childRowsForField)) continue;
        childRows[childField.key] = childRowsForField.map((childRow) => {
          if (!isRecord(childRow)) return childRow;
          return Object.fromEntries(Object.entries(childRow).map(([key, value]) => {
            const fieldDefinition = childField.childFields?.find((candidate) => candidate.key === key);
            if (!fieldDefinition || !["text", "picklist", "lookup"].includes(fieldDefinition.type)) {
              return [key, value];
            }
            const normalizeValue = (entry: unknown) => typeof entry === "string"
              && !(fieldDefinition.type === "lookup" && isMasterIdentifier(entry))
              ? normalizeUppercase(entry)
              : entry;
            return [key, Array.isArray(value) ? value.map(normalizeValue) : normalizeValue(value)];
          }));
        });
      }
      correctedPayload.childRows = childRows;
    }
  }
  let serializedPayload: string;
  try {
    serializedPayload = JSON.stringify(correctedPayload);
  } catch {
    throw new MasterImportServiceError("Import row data is invalid.", 400);
  }

  function normalizeRecordStrings(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalizeRecordStrings);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === "string" && key !== "id"
        ? normalizeUppercase(entry)
        : normalizeRecordStrings(entry),
    ]));
  }
  if (Buffer.byteLength(serializedPayload, "utf8") > MASTER_IMPORT_ROW_PAYLOAD_MAX_BYTES) {
    throw new MasterImportServiceError("Import row data exceeds the permitted size.", 413);
  }
  const encryptedPayload = Buffer.from(encryptSecret(serializedPayload), "utf8");
  let previousPayload: unknown;

  const row = await prisma.$transaction(async (transaction) => {
    const job = await transaction.masterImportJob.findFirst({
      where: { organization_id: input.organizationId, id: input.jobId },
      select: { id: true, status: true, expires_at: true },
    });
    if (!job) throw new MasterImportServiceError("Import job not found.", 404);
    if (job.expires_at <= new Date()) throw new MasterImportServiceError("Import job has expired.", 410);
    if (!["STAGED", "VALIDATED", "PARTIAL"].includes(job.status)) {
      throw new MasterImportServiceError("Rows can only be corrected after workbook staging.", 409);
    }
    const existing = await transaction.masterImportJobRow.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        row_number: input.rowNumber,
      },
      select: { id: true, status: true, encrypted_payload: true },
    });
    if (!existing) throw new MasterImportServiceError("Import row not found.", 404);
    if (existing.status === "IMPORTED" || existing.status === "SKIPPED") {
      throw new MasterImportServiceError("Imported or skipped rows cannot be corrected.", 409);
    }
    try {
      previousPayload = JSON.parse(decryptSecret(Buffer.from(existing.encrypted_payload).toString("utf8"))) as unknown;
    } catch {
      throw new MasterImportServiceError("Import row data is unavailable.", 503);
    }
    const payloadChanged = JSON.stringify(previousPayload) !== serializedPayload;
    if (!payloadChanged) {
      throw new MasterImportServiceError("No row changes were provided.", 400);
    }

    const result = await transaction.masterImportJobRow.updateMany({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        row_number: input.rowNumber,
        status: existing.status,
      },
      data: {
        status: MasterImportJobRowStatus.STAGED,
        checkpoint: "CORRECTION_PENDING",
        encrypted_payload: encryptedPayload,
        updated_by_user_id: input.actorUserId,
      },
    });
    if (result.count !== 1) throw new MasterImportServiceError("Import row changed; reload and try again.", 409);
    const savedRow = await transaction.masterImportJobRow.findFirst({
      where: {
        organization_id: input.organizationId,
        job_id: input.jobId,
        row_number: input.rowNumber,
      },
    });
    if (!savedRow) throw new MasterImportServiceError("Import row not found.", 404);
    const counts = await getRowCounts(transaction, input.organizationId, input.jobId);
    await transaction.masterImportJob.updateMany({
      where: {
        organization_id: input.organizationId,
        id: input.jobId,
        status: job.status,
      },
      data: {
        total_rows: counts.total_rows,
        processed_rows: counts.processed_rows,
        successful_rows: counts.successful_rows,
        failed_rows: counts.failed_rows,
        updated_by_user_id: input.actorUserId,
        ...(job.status === "VALIDATED" ? { status: MasterImportJobStatus.STAGED, validated_at: null } : {}),
      },
    });
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorUserId,
      module: "MASTER_DATA",
      action: "MASTER_IMPORT_ROW_CORRECTED",
      entityType: "MasterImportJobRow",
      entityId: savedRow.id,
      details: {
        jobId: input.jobId,
        rowNumber: input.rowNumber,
        status: "STAGED",
        checkpoint: "CORRECTION_PENDING",
        payloadChanged,
      },
    }, transaction);
    return savedRow;
  });

  const relatedRowsToRevalidate = await findMatchingValidationRowsForRevalidation(
    input.organizationId,
    input.jobId,
    input.rowNumber,
    previousPayload,
  );
  if (input.relatedSizeGroupUpdate && relatedRowsToRevalidate.length > 0) {
    if (jobForNormalization.module_key !== "article") {
      throw new MasterImportServiceError("Related Size Group corrections are only valid for Article imports.", 400);
    }
    if (relatedRowsToRevalidate.length + 1 > MASTER_IMPORT_VALIDATION_BATCH_SIZE) {
      throw new MasterImportServiceError(
        `More than ${MASTER_IMPORT_VALIDATION_BATCH_SIZE.toLocaleString()} matching rows require validation. Correct this group in smaller batches.`,
        400,
      );
    }
    for (const relatedRow of relatedRowsToRevalidate) {
      if (!isRecord(relatedRow.payload) || !isRecord(relatedRow.payload.fields)) {
        throw new MasterImportServiceError(`Related import row ${relatedRow.rowNumber} is invalid.`, 503);
      }
      await saveMasterImportRow({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        jobId: input.jobId,
        rowNumber: relatedRow.rowNumber,
        payload: {
          ...relatedRow.payload,
          fields: {
            ...relatedRow.payload.fields,
            Size_Group: input.relatedSizeGroupUpdate.name,
            Sizes: input.relatedSizeGroupUpdate.sizes,
          },
        },
        deferMatchingRevalidation: true,
      });
    }
  }
  if (!input.deferMatchingRevalidation && relatedRowsToRevalidate.length > 0) {
    await validateMasterImportJob({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      jobId: input.jobId,
      rowNumbers: [
        input.rowNumber,
        ...relatedRowsToRevalidate.map((row) => row.rowNumber),
      ].sort((left, right) => left - right),
    });
  }

  return {
    rowNumber: row.row_number,
    status: row.status,
    checkpoint: row.checkpoint,
    updatedAt: row.updated_at,
    ...(input.deferMatchingRevalidation
      ? { relatedRowNumbers: relatedRowsToRevalidate.map((relatedRow) => relatedRow.rowNumber) }
      : {}),
  };
}

function isMasterIdentifier(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    || /^c[a-z0-9]{24}$/.test(value);
}

function groupedNonTerminalRowCount(counts: Map<string, number>) {
  return [...counts.entries()]
    .filter(([status]) => !TERMINAL_ROW_STATUSES.includes(status as (typeof TERMINAL_ROW_STATUSES)[number]))
    .reduce((total, [, count]) => total + count, 0);
}
