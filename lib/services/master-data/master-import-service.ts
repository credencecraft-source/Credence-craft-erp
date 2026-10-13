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
export const MASTER_IMPORT_REPORT_PAGE_SIZE = 50;
export const MASTER_IMPORT_PLAN_SIZE = 100;
const MASTER_IMPORT_PLAN_BATCH_SIZE = 25;

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
  const [page, groupedRows] = await Promise.all([
    prisma.masterImportJobRow.findMany({
      where: {
        ...organizationJobRows,
        ...(pagination.tab === "planned"
          ? { row_number: 0 }
          : statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { row_number: "asc" },
      ...(pagination.tab === "all" || pagination.tab === "planned"
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
  ]);

  const countForStatus = (status: MasterImportJobRowStatus) =>
    groupedRows.find((group) => group.status === status)?._count._all ?? 0;
  const errorRowCount = countForStatus(MasterImportJobRowStatus.INVALID)
    + countForStatus(MasterImportJobRowStatus.FAILED);
  const createdRowCount = countForStatus(MasterImportJobRowStatus.IMPORTED);
  const validatedRowCount = countForStatus(MasterImportJobRowStatus.VALIDATED);
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
    validatedRowNumbers: number[];
  }> = [];
  let planCount = 0;
  if (pagination.tab === "planned") {
    const planRows = await prisma.masterImportJobRow.findMany({
      where: {
        ...organizationJobRows,
        plan_number: { not: null },
        status: {
          in: [
            MasterImportJobRowStatus.VALIDATED,
            MasterImportJobRowStatus.IMPORTED,
          ],
        },
      },
      orderBy: [{ plan_number: "asc" }, { row_number: "asc" }],
      select: { plan_number: true, row_number: true, status: true },
    });
    const groupedPlans = new Map<number, {
      recordCount: number;
      validatedCount: number;
      importedCount: number;
      validatedRowNumbers: number[];
    }>();
    for (const row of planRows) {
      if (row.plan_number === null) continue;
      const planNumber = row.plan_number;
      const plan = groupedPlans.get(planNumber) ?? {
        recordCount: 0,
        validatedCount: 0,
        importedCount: 0,
        validatedRowNumbers: [],
      };
      plan.recordCount += 1;
      if (row.status === MasterImportJobRowStatus.VALIDATED) {
        plan.validatedCount += 1;
        plan.validatedRowNumbers.push(row.row_number);
      } else if (row.status === MasterImportJobRowStatus.IMPORTED) {
        plan.importedCount += 1;
      }
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
      staged: totalRowCount - errorRowCount - createdRowCount - validatedRowCount,
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
    const rows = await prisma.masterImportJobRow.findMany({
      where: { organization_id: input.organizationId, job_id: input.jobId },
      orderBy: { row_number: "asc" },
      select: { row_number: true, status: true, checkpoint: true, updated_at: true },
    });
    return { job: publicJob(job), rows: rows.map(publicRowCheckpoint) };
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
  const encryptedRows = stagedData.map((entry, index) => ({
    organization_id: input.organizationId,
    job_id: input.jobId,
    row_number: index + 1,
    status: entry.validationErrors.length
      ? MasterImportJobRowStatus.INVALID
      : MasterImportJobRowStatus.STAGED,
    checkpoint: "PARSED",
    encrypted_payload: Buffer.from(encryptSecret(JSON.stringify({
      ...entry.payload,
      validationErrors: entry.validationErrors,
    })), "utf8"),
    updated_by_user_id: input.actorUserId,
  }));

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.masterImportJobRow.createMany({ data: encryptedRows });
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
        total_rows: encryptedRows.length,
        processed_rows: 0,
        successful_rows: 0,
        failed_rows: encryptedRows.filter((row) => row.status === MasterImportJobRowStatus.INVALID).length,
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
        rowCount: encryptedRows.length,
        invalidRowCount: countsForStagedRows(encryptedRows),
      },
    }, transaction);
    return savedJob;
  }, {
    maxWait: MASTER_IMPORT_STAGING_TRANSACTION_MAX_WAIT_MS,
    timeout: MASTER_IMPORT_STAGING_TRANSACTION_TIMEOUT_MS,
  });

  return {
    job: publicJob(result),
    rows: encryptedRows.map((row, index) => ({
      rowNumber: index + 1,
      status: row.status,
      checkpoint: row.checkpoint,
      updatedAt: result.updated_at,
    })),
  };
}

function countsForStagedRows(rows: Array<{ status: MasterImportJobRowStatus }>) {
  return rows.filter((row) => row.status === MasterImportJobRowStatus.INVALID).length;
}

type ImportValidationError = { message: string; fieldPaths: string[] };
type StagedPayload = { payload: Record<string, unknown>; validationErrors: ImportValidationError[] };

async function parseGenericMasterRows(file: File, moduleKey: string): Promise<StagedPayload[]> {
  const definition = getMasterDefinition(moduleKey);
  if (!definition || definition.hidden) {
    throw new MasterImportServiceError("Select a valid master module.", 400);
  }
  let parsed;
  try {
    parsed = await parseMasterRecordsWorkbook(file, definition, true);
  } catch (error) {
    throw new MasterImportServiceError(
      error instanceof Error ? error.message.slice(0, 500) : "Workbook could not be parsed.",
      400,
    );
  }

  const rows: StagedPayload[] = parsed.rows.map((row) => ({
    payload: { rowNumber: row.rowNumber, code: row.code, description: row.description, fields: row.fields, childRows: row.childRows },
    validationErrors: [],
  }));
  rows.push(...parsed.failures.map((failure) => ({
    payload: {
      rowNumber: failure.rowNumber,
      code: failure.row.code,
      description: failure.row.description,
      fields: failure.row.fields,
      childRows: failure.row.childRows,
    },
    validationErrors: [{ message: failure.message, fieldPaths: failure.fieldPaths ?? [] }],
  })));
  return rows.sort((left, right) => Number(left.payload.rowNumber) - Number(right.payload.rowNumber));
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
    if (!fieldDefinitions.some((field) => field.key === key)) {
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

async function validateImportPayloadForOrganization(
  organizationId: string,
  moduleKey: string,
  value: unknown,
  lookupIndex?: ActiveMasterLookupIndex,
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
  const errors = [...validation.validationErrors];
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
          if (!isActiveMasterLookupInIndex(index, childField.lookupModuleKey, childValue)) {
            errors.push({
              message: `${childField.label} must match an active value in this organization.`,
              fieldPaths: [`${field.key}.${rowIndex}.${childField.key}`],
            });
          }
        }
      }
      continue;
    }
    if (!field.lookupModuleKey) continue;
    const rawValue = fields[field.key];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const values = field.multiple
      ? Array.isArray(rawValue) ? rawValue : []
      : [rawValue];
    if (field.dependsOn) {
      const parentValue = fields[field.dependsOn];
      if (parentValue === null || parentValue === undefined || parentValue === "") {
        errors.push({
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
        errors.push({
          message: `${field.label} must match an active value in this organization${field.dependsOn ? " and its selected parent" : ""}.`,
          fieldPaths: field.dependsOn ? [field.key, field.dependsOn] : [field.key],
        });
      }
    }
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

export async function validateMasterImportJob(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  rowNumbers?: number[];
  rowNumber?: number;
}) {
  if (input.rowNumber !== undefined && input.rowNumbers !== undefined) {
    throw new MasterImportServiceError("Select one row-validation request at a time.", 400);
  }
  if (input.rowNumber !== undefined
    && (!Number.isSafeInteger(input.rowNumber) || input.rowNumber < 1)) {
    throw new MasterImportServiceError("Selected row number is invalid.", 400);
  }
  if (input.rowNumber === undefined && input.rowNumbers === undefined) {
    throw new MasterImportServiceError("Select at least one staged row to validate.", 400);
  }
  if (input.rowNumbers !== undefined
    && (input.rowNumbers.length < 1
      || input.rowNumbers.length > 1_000
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

  const rows = await prisma.masterImportJobRow.findMany({
    where: {
      organization_id: input.organizationId,
      job_id: input.jobId,
      status: { in: ["STAGED", "CORRECTED", "FAILED"] },
      ...(input.rowNumber !== undefined
        ? { row_number: input.rowNumber }
        : input.rowNumbers !== undefined ? { row_number: { in: input.rowNumbers } } : {}),
    },
    orderBy: { row_number: "asc" },
    take: input.rowNumbers?.length ?? 1,
  });
  const requestedRowCount = input.rowNumbers?.length ?? 1;
  if (rows.length !== requestedRowCount) {
    throw new MasterImportServiceError("One or more selected rows are no longer awaiting validation.", 409);
  }
  const importDefinition = getMasterDefinition(job.module_key);
  const lookupIndex = rows.length === 0 || job.module_key === "contact" || !importDefinition
    ? new Map<string, Map<string, ActiveMasterLookupRecord[]>>()
    : await loadActiveMasterLookupIndex(
        input.organizationId,
        getImportLookupModuleKeys(importDefinition.fields),
      );
  const validationResults: Array<{
    row: (typeof rows)[number];
    validation: Awaited<ReturnType<typeof validateImportPayloadForOrganization>>;
    encryptedPayload: Uint8Array<ArrayBuffer>;
  }> = [];
  for (const row of rows) {
    let previousPayload: unknown;
    try {
      previousPayload = JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))) as unknown;
    } catch {
      throw new MasterImportServiceError("Import row data is unavailable.", 503);
    }
    const validation = await validateImportPayloadForOrganization(
      input.organizationId,
      job.module_key,
      previousPayload,
      lookupIndex,
    );
    const encryptedPayload = new Uint8Array(Buffer.from(encryptSecret(JSON.stringify({
      ...validation.payload,
      validationErrors: validation.validationErrors,
    })), "utf8"));
    validationResults.push({ row, validation, encryptedPayload });
  }

  const result = await prisma.$transaction(async (transaction) => {
    for (const { row, validation, encryptedPayload } of validationResults) {
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
          checkpoint: validation.validationErrors.length ? "VALIDATION_FAILED" : "VALIDATED",
          encrypted_payload: encryptedPayload,
          updated_by_user_id: input.actorUserId,
        },
      });
      if (updated.count !== 1) {
        throw new MasterImportServiceError("Import row changed during validation; reload and retry.", 409);
      }
      await createAuditEvent({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        module: "MASTER_DATA",
        action: validation.validationErrors.length ? "MASTER_IMPORT_ROW_INVALID" : "MASTER_IMPORT_ROW_VALIDATED",
        entityType: "MasterImportJobRow",
        entityId: row.id,
        details: {
          jobId: input.jobId,
          rowNumber: row.row_number,
          status: validation.validationErrors.length ? "INVALID" : "VALIDATED",
          fieldPaths: validation.validationErrors.flatMap((error) => error.fieldPaths),
        },
      }, transaction);
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
        status: { in: ["STAGED", "CORRECTED", "FAILED"] },
        ...(input.rowNumber !== undefined
          ? { row_number: input.rowNumber }
          : input.rowNumbers !== undefined ? { row_number: { in: input.rowNumbers } } : {}),
      },
      select: { row_number: true },
      orderBy: { row_number: "asc" },
    }));
  return {
    job: publicJob(result.savedJob),
    progress: {
      totalRows: result.counts.total_rows,
      processedRows: result.counts.processed_rows,
      successfulRows: result.counts.successful_rows,
      failedRows: result.counts.failed_rows,
      validatedRows: (result.counts.counts.get(MasterImportJobRowStatus.VALIDATED) ?? 0)
        + (result.counts.counts.get(MasterImportJobRowStatus.IMPORTED) ?? 0),
    },
    hasMore,
  };
}

export async function createMasterImportPlans(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
}) {
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

    while (true) {
      const rows = await transaction.masterImportJobRow.findMany({
        where: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          status: MasterImportJobRowStatus.VALIDATED,
          plan_number: null,
        },
        orderBy: { row_number: "asc" },
        take: MASTER_IMPORT_PLAN_SIZE,
        select: { row_number: true },
      });
      if (rows.length === 0) break;

      const assigned = await transaction.masterImportJobRow.updateMany({
        where: {
          organization_id: input.organizationId,
          job_id: input.jobId,
          row_number: { in: rows.map((row) => row.row_number) },
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

export async function commitNextMasterImportRow(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  rowNumber?: number;
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
        await createMasterValueForOrganization(input.organizationId, job.module_key, {
          label,
          code: typeof validation.payload.code === "string" ? validation.payload.code : null,
          description: typeof validation.payload.description === "string" ? validation.payload.description : null,
          fields: masterFields,
          childRows: isRecord(validation.payload.childRows)
            ? Object.fromEntries(Object.entries(validation.payload.childRows).map(([key, rows]) => [
                key,
                Array.isArray(rows) ? rows.filter(isRecord) : [],
              ]))
            : {},
          ...(job.module_key === "article" && isRecord(validation.payload.childRows)
            && Array.isArray(validation.payload.childRows.variants)
            ? {
                articleVariants: validation.payload.childRows.variants
                  .filter(isRecord)
                  .map((childFields) => ({ fields: childFields })),
              }
            : {}),
          ...(job.module_key === "article" && Array.isArray(masterFields.Sizes)
            ? { articleSizes: masterFields.Sizes.filter((value): value is string => typeof value === "string") }
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
    const message = error instanceof Error && error.name === "ContactValidationError"
      ? "Contact data must be corrected before retrying."
      : errorCode === "P2028"
        ? "The database transaction could not be completed. No master changes were saved; validate this row and retry."
        : errorCode === "P2002"
          ? "This row conflicts with an existing master record. Check for a duplicate and retry."
          : "The record was not saved. Validate this row and retry; if the issue repeats, contact your administrator.";
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

function publicRowCheckpoint(row: {
  row_number: number;
  status: MasterImportJobRowStatus;
  checkpoint: string | null;
  updated_at: Date;
}) {
  return {
    rowNumber: row.row_number,
    status: row.status,
    checkpoint: row.checkpoint,
    updatedAt: row.updated_at,
  };
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

export async function saveMasterImportRow(input: {
  organizationId: string;
  actorUserId: string;
  jobId: string;
  rowNumber: number;
  payload: unknown;
}) {
  if (!Number.isSafeInteger(input.rowNumber) || input.rowNumber < 1) {
    throw new MasterImportServiceError("Row number must be a positive integer.", 400);
  }
  if (!isRecord(input.payload)) {
    throw new MasterImportServiceError("Import row correction is invalid.", 400);
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
    let previousPayload: unknown;
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

  return {
    rowNumber: row.row_number,
    status: row.status,
    checkpoint: row.checkpoint,
    updatedAt: row.updated_at,
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
