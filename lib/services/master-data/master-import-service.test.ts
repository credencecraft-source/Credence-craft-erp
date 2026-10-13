import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  prisma: {
    masterImportJob: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    masterImportJobRow: {
      createMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    masterImportJobFileChunk: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    auditEvent: { createMany: vi.fn() },
    $transaction: vi.fn(),
    workspaceUser: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createAuditEvent: vi.fn(),
  parseContactWorkbook: vi.fn(),
  parseMasterRecordsWorkbook: vi.fn(),
  createContact: vi.fn(),
  createMasterValueForOrganization: vi.fn(),
  isActiveMasterLookupForOrganization: vi.fn(),
  loadActiveMasterLookupIndex: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/master-data/contact-records-workbook-parser", () => ({
  parseContactWorkbook: mocks.parseContactWorkbook,
}));
vi.mock("@/lib/master-data/master-records-workbook", () => ({
  parseMasterRecordsWorkbook: mocks.parseMasterRecordsWorkbook,
}));
vi.mock("@/lib/services/master-data/contact-master-service", () => ({
  createContact: mocks.createContact,
}));
vi.mock("@/lib/master-data/master-data-constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/master-data/master-data-constants")>();
  return {
    ...actual,
    createMasterValueForOrganization: mocks.createMasterValueForOrganization,
    isActiveMasterLookupForOrganization: mocks.isActiveMasterLookupForOrganization,
    loadActiveMasterLookupIndex: mocks.loadActiveMasterLookupIndex,
  };
});

import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import {
  commitNextMasterImportRow,
  createMasterImportPlans,
  createMasterImportJob,
  deleteMasterImportJob,
  getMasterImportPlanProgress,
  getValidatedMasterImportPlanRows,
  getMasterImportJob,
  listMasterImportJobs,
  MASTER_IMPORT_PLAN_SIZE,
  MASTER_IMPORT_VALIDATION_BATCH_SIZE,
  saveMasterImportRow,
  stageMasterImportJob,
  transitionMasterImportJob,
  validateMasterImportJob,
} from "./master-import-service";

const now = new Date("2026-10-12T12:00:00.000Z");
const baseJob = {
  id: "job-1",
  organization_id: "org-internal",
  module_key: "season",
  status: "UPLOADED" as const,
  uploaded_file_name: "seasons.xlsx",
  uploaded_file_size: 4,
  encrypted_source_file: Buffer.from("not-for-response"),
  total_rows: 0,
  processed_rows: 0,
  successful_rows: 0,
  failed_rows: 0,
  checkpoint: null,
  created_by_user_id: "actor-1",
  updated_by_user_id: "actor-1",
  created_at: now,
  updated_at: now,
  staged_at: null,
  validated_at: null,
  started_at: null,
  completed_at: null,
  failed_at: null,
  file_chunk_count: 1,
  uploaded_file_chunks: 0,
  source_sha256: createHash("sha256").update(new Uint8Array([80, 75, 3, 4])).digest("hex"),
  expires_at: new Date("2026-11-11T12:00:00.000Z"),
};

function rowRecord(status: string, payload: Record<string, unknown> = { Season: "WINTER" }) {
  return {
    id: "row-1",
    organization_id: "org-internal",
    job_id: "job-1",
    row_number: 1,
    status,
    plan_number: null,
    checkpoint: null,
    encrypted_payload: Buffer.from(encryptSecret(JSON.stringify(payload))),
    updated_by_user_id: "actor-1",
    created_at: now,
    updated_at: now,
  };
}

describe("master import service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "focused-test-secret";
    mocks.prisma.masterImportJob.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.masterImportJobRow.count.mockResolvedValue(0);
    mocks.prisma.workspaceUser.findMany.mockResolvedValue([]);
    mocks.loadActiveMasterLookupIndex.mockResolvedValue(new Map());
    mocks.createAuditEvent.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) =>
      callback(mocks.prisma));
  });

  it("returns only safe list DTO fields scoped to the authorized organization", async () => {
    mocks.prisma.masterImportJob.findMany.mockResolvedValue([baseJob]);
    mocks.prisma.workspaceUser.findMany.mockResolvedValue([{ id: "actor-1", full_name: "ALEX RIVERA" }]);

    const jobs = await listMasterImportJobs("org-internal", { skip: 0, take: 20 });

    expect(mocks.prisma.masterImportJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", expires_at: expect.any(Object) },
    }));
    expect(mocks.prisma.workspaceUser.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ["actor-1"] },
        organizationMemberships: { some: { organization_id: "org-internal", is_active: true } },
      },
    }));
    expect(jobs[0]).toMatchObject({
      id: "job-1",
      moduleKey: "season",
      status: "UPLOADED",
      uploaderDisplayName: "ALEX RIVERA",
    });
    expect(JSON.stringify(jobs)).not.toContain("not-for-response");
    expect(JSON.stringify(jobs)).not.toContain("encrypted_source_file");
  });

  it("deletes an unimported job within the authorized organization and audits the action", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      status: "STAGED",
      successful_rows: 0,
      total_rows: 3,
    });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);
    mocks.prisma.masterImportJob.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    })).resolves.toEqual({ deleted: true });

    expect(mocks.prisma.masterImportJob.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-internal",
        id: "job-1",
        status: "STAGED",
        successful_rows: 0,
      },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-internal",
      userId: "actor-1",
      action: "MASTER_IMPORT_DELETED",
      entityId: "job-1",
    }), mocks.prisma);
  });

  it("preserves imports that already created master records", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      status: "PARTIAL",
      successful_rows: 1,
    });

    await expect(deleteMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.prisma.masterImportJob.deleteMany).not.toHaveBeenCalled();
  });

  it("preserves a job with imported rows even when its summary counter is stale", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      status: "STAGED",
      successful_rows: 0,
    });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue({ row_number: 2 });

    await expect(deleteMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.prisma.masterImportJob.deleteMany).not.toHaveBeenCalled();
  });

  it("creates a metadata-only upload job for independently persisted workbook chunks", async () => {
    mocks.prisma.masterImportJob.create.mockImplementation(async ({ data }) => ({
      ...baseJob,
      ...data,
      created_at: now,
      updated_at: now,
      staged_at: null,
      validated_at: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    }));

    const job = await createMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      moduleKey: "season",
      uploadedFileName: "seasons.xlsx",
      uploadedFileSize: 4,
      sourceSha256: baseJob.source_sha256,
    });
    const createData = mocks.prisma.masterImportJob.create.mock.calls[0][0].data;

    expect(createData.encrypted_source_file).toEqual(Buffer.alloc(0));
    expect(createData.status).toBe("UPLOADING");
    expect(createData.file_chunk_count).toBe(1);
    expect(job).toMatchObject({ id: "job-1", status: "UPLOADING", uploadedFileName: "seasons.xlsx" });
    expect(JSON.stringify(job)).not.toContain("encrypted_source_file");
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "MASTER_IMPORT_UPLOAD_STARTED",
      details: { moduleKey: "season", fileSize: 4, fileChunkCount: 1 },
    }), mocks.prisma);
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 10_000, timeout: 20_000 },
    );
  });

  it("saves one encrypted upload chunk and advances its durable checkpoint", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({ ...baseJob, status: "UPLOADING" });
    mocks.prisma.masterImportJobFileChunk.findUnique.mockResolvedValue(null);
    mocks.prisma.masterImportJobFileChunk.create.mockResolvedValue({});
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    await expect(import("./master-import-service").then(({ saveMasterImportFileChunk }) =>
      saveMasterImportFileChunk({
        organizationId: "org-internal",
        actorUserId: "actor-1",
        jobId: "job-1",
        chunkIndex: 0,
        chunkBytes: bytes,
      }),
    )).resolves.toEqual({ uploadedFileChunks: 1 });
    const savedChunk = mocks.prisma.masterImportJobFileChunk.create.mock.calls[0][0].data;
    expect(savedChunk).toMatchObject({
      organization_id: "org-internal",
      job_id: "job-1",
      chunk_index: 0,
      byte_size: 4,
      sha256: baseJob.source_sha256,
    });
    expect(Buffer.from(savedChunk.encrypted_data).toString("utf8")).not.toContain("UEsDBA==");
    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ uploaded_file_chunks: 0 }),
      data: expect.objectContaining({ uploaded_file_chunks: { increment: 1 } }),
    }));
  });

  it("rejects non-XLSX data before saving the first chunk", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({ ...baseJob, status: "UPLOADING" });

    await expect(import("./master-import-service").then(({ saveMasterImportFileChunk }) =>
      saveMasterImportFileChunk({
        organizationId: "org-internal",
        actorUserId: "actor-1",
        jobId: "job-1",
        chunkIndex: 0,
        chunkBytes: new Uint8Array([1, 2, 3, 4]),
      }),
    )).rejects.toMatchObject({
      status: 400,
      message: "Uploaded file is not a valid .xlsx workbook.",
    });
    expect(mocks.prisma.masterImportJobFileChunk.create).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportJob.updateMany).not.toHaveBeenCalled();
  });

  it("accepts exact chunk retries without duplicating saved bytes", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      status: "UPLOADING",
      uploaded_file_chunks: 1,
    });
    mocks.prisma.masterImportJobFileChunk.findUnique.mockResolvedValue({
      sha256: baseJob.source_sha256,
      byte_size: 4,
    });

    await expect(import("./master-import-service").then(({ saveMasterImportFileChunk }) =>
      saveMasterImportFileChunk({
        organizationId: "org-internal",
        actorUserId: "actor-1",
        jobId: "job-1",
        chunkIndex: 0,
        chunkBytes: bytes,
      }),
    )).resolves.toEqual({ uploadedFileChunks: 1 });
    expect(mocks.prisma.masterImportJobFileChunk.create).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportJob.updateMany).not.toHaveBeenCalled();
  });

  it("completes uploads only after every ordered chunk is durably present", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, status: "UPLOADING", uploaded_file_chunks: 1 })
      .mockResolvedValueOnce({
        ...baseJob,
        status: "UPLOADED",
        uploaded_file_chunks: 1,
        checkpoint: "UPLOAD_COMPLETED",
      });
    mocks.prisma.masterImportJobFileChunk.findMany.mockResolvedValue([
      { chunk_index: 0, byte_size: 4 },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await import("./master-import-service").then(({ completeMasterImportFileUpload }) =>
      completeMasterImportFileUpload({
        organizationId: "org-internal",
        actorUserId: "actor-1",
        jobId: "job-1",
      }),
    );

    expect(result.job).toMatchObject({ status: "UPLOADED", uploadedFileChunks: 1 });
    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        id: "job-1",
        status: "UPLOADING",
        uploaded_file_chunks: 1,
      }),
      data: expect.objectContaining({ status: "UPLOADED", checkpoint: "UPLOAD_COMPLETED" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "MASTER_IMPORT_UPLOAD_COMPLETED",
    }), mocks.prisma);
  });

  it("does not complete a partial upload", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      status: "UPLOADING",
      uploaded_file_chunks: 0,
    });

    await expect(import("./master-import-service").then(({ completeMasterImportFileUpload }) =>
      completeMasterImportFileUpload({
        organizationId: "org-internal",
        actorUserId: "actor-1",
        jobId: "job-1",
      }),
    )).rejects.toMatchObject({ status: 409 });
    expect(mocks.prisma.masterImportJob.updateMany).not.toHaveBeenCalled();
  });

  it("stages generic workbook rows atomically with encrypted payloads and validation errors", async () => {
    const source = new Uint8Array([80, 75, 3, 4]);
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({
        ...baseJob,
        encrypted_source_file: Buffer.from(encryptSecret(Buffer.from(source).toString("base64"))),
      })
      .mockResolvedValueOnce({ ...baseJob, status: "STAGED", total_rows: 2 });
    mocks.parseMasterRecordsWorkbook.mockResolvedValue({
      rows: [{
        rowNumber: 2,
        code: null,
        description: null,
        fields: { season_name: "WINTER" },
        childRows: {},
      }],
      failures: [{
        rowNumber: 3,
        message: "Name is required.",
        row: { rowNumber: 3, code: null, description: null, fields: { season_name: "" }, childRows: {} },
      }],
    });

    mocks.prisma.masterImportJobRow.createMany.mockResolvedValue({ count: 2 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const staged = await stageMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });
    const insertedRows = mocks.prisma.masterImportJobRow.createMany.mock.calls[0][0].data;

    expect(mocks.prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      { maxWait: 10_000, timeout: 120_000 },
    );
    expect(mocks.parseMasterRecordsWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({ name: "seasons.xlsx", size: 4 }),
      expect.objectContaining({ key: "season" }),
      true,
    );
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].status).toBe("STAGED");
    expect(insertedRows[1].status).toBe("INVALID");
    expect(Buffer.from(insertedRows[1].encrypted_payload).toString("utf8")).not.toContain("Name is required.");
    expect(JSON.stringify(staged)).not.toContain("validationErrors");
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "MASTER_IMPORT_STAGED",
      details: { rowCount: 2, invalidRowCount: 1 },
    }), mocks.prisma);
  });

  it("reconstructs and verifies encrypted upload chunks before staging rows", async () => {
    const source = new Uint8Array([80, 75, 3, 4]);
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, encrypted_source_file: Buffer.alloc(0) })
      .mockResolvedValueOnce({ ...baseJob, status: "STAGED", total_rows: 1 });
    mocks.prisma.masterImportJobFileChunk.findMany.mockResolvedValue([{
      chunk_index: 0,
      byte_size: source.byteLength,
      sha256: baseJob.source_sha256,
      encrypted_data: Buffer.from(encryptSecret(Buffer.from(source).toString("base64"))),
    }]);
    mocks.parseMasterRecordsWorkbook.mockResolvedValue({
      rows: [{
        rowNumber: 2,
        code: "WINTER",
        description: "WINTER",
        fields: { season_name: "WINTER" },
        childRows: {},
      }],
      failures: [],
    });
    mocks.prisma.masterImportJobRow.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const staged = await stageMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });

    expect(mocks.parseMasterRecordsWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "seasons.xlsx",
        size: source.byteLength,
        arrayBuffer: expect.any(Function),
      }),
      expect.objectContaining({ key: "season" }),
      true,
    );
    const workbook = mocks.parseMasterRecordsWorkbook.mock.calls[0][0] as File;
    expect(new Uint8Array(await workbook.arrayBuffer())).toEqual(source);
    expect(staged).toMatchObject({ job: { status: "STAGED" } });
  });

  it("rejects tampered upload chunks before parsing or staging", async () => {
    const source = new Uint8Array([80, 75, 3, 4]);
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      encrypted_source_file: Buffer.alloc(0),
    });
    mocks.prisma.masterImportJobFileChunk.findMany.mockResolvedValue([{
      chunk_index: 0,
      byte_size: source.byteLength,
      sha256: "f".repeat(64),
      encrypted_data: Buffer.from(encryptSecret(Buffer.from(source).toString("base64"))),
    }]);

    await expect(stageMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    })).rejects.toMatchObject({ status: 503, message: "Uploaded workbook is unavailable." });
    expect(mocks.parseMasterRecordsWorkbook).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportJobRow.createMany).not.toHaveBeenCalled();
  });

  it("makes repeated staging requests idempotent and does not parse or duplicate staged rows", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({ ...baseJob, status: "STAGED" });
    const staged = await stageMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });

    expect(staged).toMatchObject({ job: { status: "STAGED" } });
    expect(mocks.parseMasterRecordsWorkbook).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportJobRow.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportJobRow.findMany).not.toHaveBeenCalled();
  });

  it("decrypts row payload only in the tenant-scoped authorized detail response", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
    });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([
      rowRecord("STAGED", { Season: "WINTER", token: "private-value" }),
    ]);
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "STAGED", _count: { _all: 1 } },
      { status: "VALIDATED", _count: { _all: 3 } },
      { status: "INVALID", _count: { _all: 2 } },
      { status: "FAILED", _count: { _all: 1 } },
      { status: "IMPORTED", _count: { _all: 4 } },
    ]);
    mocks.prisma.masterImportJobRow.count.mockResolvedValue(2);

    const detail = await getMasterImportJob("org-internal", "job-1", {
      skip: 0,
      take: 50,
      tab: "staged",
    });

    expect(mocks.prisma.masterImportJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", id: "job-1" },
    }));
    expect(detail.rows[0].payload).toEqual({ Season: "WINTER", token: "private-value" });
    expect(detail.rowCounts).toEqual({ staged: 1, validated: 2, errors: 3, created: 4 });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        status: { notIn: ["IMPORTED", "VALIDATED", "INVALID", "FAILED"] },
      },
      orderBy: { row_number: "asc" },
      skip: 0,
      take: 50,
    }));
    expect(JSON.stringify(detail)).not.toContain("encrypted_payload");
    expect(JSON.stringify(detail)).not.toContain("encrypted_source_file");
  });

  it("returns commit-failed rows in the errors report with their actionable reason", async () => {
    const failurePayload = {
      Season: "WINTER",
      validationErrors: [{
        message: "This row conflicts with an existing master record. Check for a duplicate and retry.",
        fieldPaths: [],
      }],
    };
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({ ...baseJob });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([
      rowRecord("FAILED", failurePayload),
    ]);
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "FAILED", _count: { _all: 1 } },
    ]);

    const detail = await getMasterImportJob("org-internal", "job-1", {
      skip: 0,
      take: 50,
      tab: "errors",
    });

    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        status: { in: ["INVALID", "FAILED"] },
      },
    }));
    expect(detail.rows[0]).toMatchObject({
      rowNumber: 1,
      status: "FAILED",
      payload: failurePayload,
    });
    expect(detail.rowCounts.errors).toBe(1);
  });

  it("hides planned rows from the validated report and count", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({ ...baseJob });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([
      rowRecord("VALIDATED", { Season: "UNPLANNED" }),
    ]);
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 3 } },
      { status: "IMPORTED", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJobRow.count.mockResolvedValue(1);

    const detail = await getMasterImportJob("org-internal", "job-1", {
      skip: 0,
      take: 50,
      tab: "validated",
    });

    expect(detail.rows).toHaveLength(1);
    expect(detail.rowCounts.validated).toBe(1);
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        status: "VALIDATED",
        plan_number: null,
      },
      skip: 0,
      take: 50,
    }));
    expect(mocks.prisma.masterImportJobRow.count).toHaveBeenCalledWith({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        status: "VALIDATED",
        plan_number: null,
      },
    });
  });

  it("caps one validation transaction at the safe 100-row batch limit", async () => {
    expect(MASTER_IMPORT_VALIDATION_BATCH_SIZE).toBe(100);
    await expect(validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumbers: Array.from({ length: 101 }, (_, index) => index + 1),
    })).rejects.toMatchObject({ status: 400 });
    expect(mocks.prisma.masterImportJob.findFirst).not.toHaveBeenCalled();
  });

  it("rejects importing before the required staging and validation stages", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue(baseJob);

    await expect(transitionMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      status: "IMPORTING",
    })).rejects.toMatchObject({ status: 409 });

    expect(mocks.prisma.masterImportJobRow.groupBy).not.toHaveBeenCalled();
  });

  it("rejects a workspace mismatch before organization authorization", async () => {
    mocks.prisma.workspaceUser.findFirst.mockResolvedValue(null);

    await expect(import("./master-import-service").then(({ authorizeMasterImportRequest }) =>
      authorizeMasterImportRequest("actor-1", "wrong-workspace", "public-org"),
    )).rejects.toMatchObject({ status: 401 });

    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
  });

  it("resolves the public organization to its internal tenant ID before checking permission", async () => {
    mocks.prisma.workspaceUser.findFirst.mockResolvedValue({ id: "actor-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "org-internal" });
    mocks.requireOrganizationPermission.mockResolvedValue({});

    const { authorizeMasterImportRequest } = await import("./master-import-service");
    const result = await authorizeMasterImportRequest("actor-1", "workspace-1", "public-org");

    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("actor-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "actor-1",
      "org-internal",
      "MANAGE_MASTER_DATA",
    );
    expect(result.organizationId).toBe("org-internal");
  });

  it("prevents terminal imported rows from being changed", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      status: "PARTIAL",
      expires_at: new Date("2026-11-11T12:00:00.000Z"),
    });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue({
      id: "row-1",
      status: "IMPORTED",
      encrypted_payload: rowRecord("IMPORTED").encrypted_payload,
    });

    await expect(saveMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
      payload: { Season: "CHANGED" },
    })).rejects.toMatchObject({ status: 409 });

    expect(mocks.prisma.masterImportJobRow.updateMany).not.toHaveBeenCalled();
  });

  it("saves staged row payload encrypted with the tenant/job/row compound key", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      status: "STAGED",
      module_key: "season",
      expires_at: new Date("2026-11-11T12:00:00.000Z"),
    });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce(rowRecord("STAGED"))
      .mockResolvedValueOnce({
        ...rowRecord("CORRECTED"),
        status: "STAGED",
        checkpoint: "CORRECTION_PENDING",
        updated_at: now,
      });
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([{ status: "STAGED", _count: { _all: 1 } }]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const row = await saveMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
      payload: { fields: { season: "new season" }, childRows: {}, note: "sensitive-row" },
    });
    const updateArgs = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0];

    expect(updateArgs.where).toEqual({
      organization_id: "org-internal",
      job_id: "job-1",
      row_number: 1,
      status: "STAGED",
    });
    expect(Buffer.from(updateArgs.data.encrypted_payload).toString("utf8")).not.toContain("sensitive-row");
    expect(JSON.parse(decryptSecret(Buffer.from(updateArgs.data.encrypted_payload).toString("utf8"))))
      .toMatchObject({ fields: { season: "NEW SEASON" } });
    expect(updateArgs.data).toMatchObject({ status: "STAGED", checkpoint: "CORRECTION_PENDING" });
    expect(row).toMatchObject({ rowNumber: 1, status: "STAGED", checkpoint: "CORRECTION_PENDING" });
    expect(JSON.stringify(row)).not.toContain("sensitive-row");
  });

  it("moves a corrected failed row out of its old plan when it validates", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, status: "VALIDATED", total_rows: 1 });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([{
      ...rowRecord("FAILED", {
        rowNumber: 2,
        fields: { season: "WINTER" },
        childRows: {},
      }),
      plan_number: 1,
    }]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        job_id: "job-1",
        row_number: 1,
        status: { in: ["STAGED", "CORRECTED", "FAILED"] },
      }),
      take: 1,
    }));
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "VALIDATED", plan_number: null, checkpoint: "VALIDATED" }),
    }));
    expect(result).toMatchObject({
      job: { status: "VALIDATED" },
      validatedRowNumbers: [1],
      progress: { totalRows: 1, processedRows: 0, failedRows: 0 },
      hasMore: false,
    });
  });

  it("rejects generic lookup values not active in the authorized organization", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "sub-category", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "sub-category", status: "PARTIAL", total_rows: 1 });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([
      rowRecord("STAGED", {
        rowNumber: 2,
        fields: { category: "FOREIGN CATEGORY", sub_category: "TOPS" },
        childRows: {},
      }),
      {
        ...rowRecord("STAGED", {
          rowNumber: 3,
          fields: { category: "FOREIGN CATEGORY", sub_category: "BOTTOMS" },
          childRows: {},
        }),
        id: "row-2",
        row_number: 2,
      },
    ]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumbers: [1, 2],
    });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ row_number: { in: [1, 2] } }),
      take: 2,
    }));
    const update = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0];
    const savedPayload = JSON.parse(decryptSecret(Buffer.from(update.data.encrypted_payload).toString("utf8")));

    expect(mocks.loadActiveMasterLookupIndex).toHaveBeenCalledTimes(1);
    expect(mocks.loadActiveMasterLookupIndex).toHaveBeenCalledWith(
      "org-internal",
      new Set(["category"]),
    );
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.auditEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          organization_id: "org-internal",
          user_id: "actor-1",
          action: "MASTER_IMPORT_ROW_INVALID",
          entity_id: "row-1",
        }),
        expect.objectContaining({
          organization_id: "org-internal",
          user_id: "actor-1",
          action: "MASTER_IMPORT_ROW_INVALID",
          entity_id: "row-2",
        }),
      ]),
    });
    expect(mocks.prisma.auditEvent.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(update.data.status).toBe("INVALID");
    expect(savedPayload.validationErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldPaths: ["category"] }),
    ]));
    expect(result).toMatchObject({ job: { status: "PARTIAL" }, progress: { failedRows: 1 } });
  });

  it("requires explicit row selection before validation", async () => {
    await expect(validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    })).rejects.toMatchObject({ status: 400 });
    expect(mocks.prisma.masterImportJob.findFirst).not.toHaveBeenCalled();
  });

  it("reports persisted plan membership rather than inferring plans from workbook row numbers", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      total_rows: 202,
    });
    mocks.prisma.masterImportJobRow.groupBy
      .mockResolvedValueOnce([
        { status: "VALIDATED", _count: { _all: 2 } },
        { status: "IMPORTED", _count: { _all: 1 } },
        { status: "INVALID", _count: { _all: 1 } },
        { status: "FAILED", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { plan_number: 1, status: "VALIDATED", _count: { _all: 1 } },
        { plan_number: 1, status: "IMPORTED", _count: { _all: 1 } },
        { plan_number: 1, status: "FAILED", _count: { _all: 1 } },
        { plan_number: 2, status: "VALIDATED", _count: { _all: 1 } },
      ]);

    const detail = await getMasterImportJob("org-internal", "job-1", {
      skip: 0,
      take: 50,
      tab: "planned",
    });

    expect(MASTER_IMPORT_PLAN_SIZE).toBe(100);
    expect(mocks.prisma.masterImportJobRow.findMany).not.toHaveBeenCalled();
    expect(detail.plans).toEqual([
      {
        planNumber: 1,
        recordCount: 3,
        validatedCount: 1,
        importedCount: 1,
        errorCount: 1,
      },
      {
        planNumber: 2,
        recordCount: 1,
        validatedCount: 1,
        importedCount: 0,
        errorCount: 0,
      },
    ]);
    expect(detail.planCount).toBe(2);
    expect(mocks.prisma.masterImportJobRow.groupBy).toHaveBeenLastCalledWith({
      by: ["plan_number", "status"],
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        plan_number: { not: null },
      },
      _count: { _all: true },
    });
    expect(mocks.prisma.masterImportJobRow.findMany).not.toHaveBeenCalled();
  });

  it("reports tenant-scoped live counts for one import plan", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      expires_at: new Date("2026-10-15T00:00:00.000Z"),
    });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 12 } },
      { status: "IMPORTED", _count: { _all: 30 } },
      { status: "FAILED", _count: { _all: 2 } },
    ]);

    await expect(getMasterImportPlanProgress("org-internal", "job-1", 3)).resolves.toEqual({
      recordCount: 44,
      validatedCount: 12,
      importedCount: 30,
      errorCount: 2,
    });
    expect(mocks.prisma.masterImportJobRow.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        plan_number: 3,
      },
      _count: { _all: true },
    });
  });

  it("creates separate plans for each planning action and never exceeds 100 rows", async () => {
    const plannedRows: Array<{ row_number: number; status: string; plan_number: number | null }> = [];
    let nextPlanNumber = 1;
    mocks.prisma.masterImportJob.updateMany.mockImplementation(async (args: {
      data: { next_plan_number?: number };
    }) => {
      if (args.data.next_plan_number !== undefined) nextPlanNumber = args.data.next_plan_number;
      return { count: 1 };
    });
    mocks.prisma.masterImportJob.findFirst.mockImplementation(async () => ({
      id: "job-1",
      status: "VALIDATED",
      expires_at: new Date("2026-11-11T12:00:00.000Z"),
      next_plan_number: nextPlanNumber,
    }));
    mocks.prisma.masterImportJobRow.findMany.mockImplementation(async (args: {
      where: { plan_number: null; status: string };
    }) => plannedRows
      .filter((row) => row.status === args.where.status && row.plan_number === args.where.plan_number)
      .sort((left, right) => left.row_number - right.row_number)
      .map(({ row_number }) => ({ row_number })));
    mocks.prisma.masterImportJobRow.updateMany.mockImplementation(async (args: {
      where: { row_number: { in: number[] }; plan_number: null; status: string };
      data: { plan_number: number };
    }) => {
      let count = 0;
      for (const row of plannedRows) {
        if (args.where.row_number.in.includes(row.row_number)
          && row.status === args.where.status && row.plan_number === args.where.plan_number) {
          row.plan_number = args.data.plan_number;
          count += 1;
        }
      }
      return { count };
    });

    for (let rowNumber = 1; rowNumber <= 50; rowNumber += 1) {
      plannedRows.push({ row_number: rowNumber, status: "VALIDATED", plan_number: null });
    }
    await expect(createMasterImportPlans({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    })).resolves.toMatchObject({
      plans: [{ planNumber: 1, recordCount: 50 }],
      planCount: 1,
      plannedRowCount: 50,
    });

    for (let rowNumber = 51; rowNumber <= 53; rowNumber += 1) {
      plannedRows.push({ row_number: rowNumber, status: "VALIDATED", plan_number: null });
    }
    await expect(createMasterImportPlans({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    })).resolves.toMatchObject({
      plans: [{ planNumber: 2, recordCount: 3 }],
      planCount: 1,
      plannedRowCount: 3,
    });

    expect(plannedRows.filter((row) => row.plan_number === 1)).toHaveLength(50);
    expect(plannedRows.filter((row) => row.plan_number === 2)).toHaveLength(3);
    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", id: "job-1" },
    }));
  });

  it("splits a single planning action into plans containing at most 100 records", async () => {
    const plannedRows = Array.from({ length: 202 }, (_, index) => ({
      row_number: index + 1,
      status: "VALIDATED",
      plan_number: null as number | null,
    }));
    let nextPlanNumber = 1;
    mocks.prisma.masterImportJob.updateMany.mockImplementation(async (args: {
      data: { next_plan_number?: number };
    }) => {
      if (args.data.next_plan_number !== undefined) nextPlanNumber = args.data.next_plan_number;
      return { count: 1 };
    });

    mocks.prisma.masterImportJob.findFirst.mockImplementation(async () => ({
      id: "job-1",
      status: "VALIDATED",
      expires_at: new Date("2026-11-11T12:00:00.000Z"),
      next_plan_number: nextPlanNumber,
    }));
    mocks.prisma.masterImportJobRow.findMany.mockImplementation(async (args: {
      where: { plan_number: null; status: string };
    }) => plannedRows
      .filter((row) => row.status === args.where.status && row.plan_number === args.where.plan_number)
      .map(({ row_number }) => ({ row_number })));
    mocks.prisma.masterImportJobRow.updateMany.mockImplementation(async (args: {
      where: { row_number: { in: number[] }; plan_number: null; status: string };
      data: { plan_number: number };
    }) => {
      const rowNumbers = new Set(args.where.row_number.in);
      const rows = plannedRows.filter((row) => rowNumbers.has(row.row_number)
        && row.status === args.where.status && row.plan_number === args.where.plan_number);
      rows.forEach((row) => { row.plan_number = args.data.plan_number; });
      return { count: rows.length };
    });

    const result = await createMasterImportPlans({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });

    expect(result.plans).toEqual([
      { planNumber: 1, recordCount: 100 },
      { planNumber: 2, recordCount: 100 },
      { planNumber: 3, recordCount: 2 },
    ]);
    expect(Math.max(...result.plans.map((plan) => plan.recordCount))).toBe(MASTER_IMPORT_PLAN_SIZE);
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalledTimes(3);
  });

  it("restricts Auto Plan to the validated rows from its current batch", async () => {
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      status: "VALIDATED",
      expires_at: new Date("2026-11-11T12:00:00.000Z"),
      next_plan_number: 1,
    });
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([{ row_number: 12 }]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });

    const result = await createMasterImportPlans({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumbers: [12],
    });

    expect(result).toMatchObject({
      plans: [{ planNumber: 1, recordCount: 1 }],
      plannedRowCount: 1,
    });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        job_id: "job-1",
        status: "VALIDATED",
        plan_number: null,
        row_number: { in: [12] },
      }),
    }));
  });

  it("loads only validated rows assigned to the requested tenant-scoped plan", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      total_rows: 100,
      expires_at: new Date("2026-11-11T12:00:00.000Z"),
    });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([
      { row_number: 4 },
      { row_number: 200 },
    ]);

    await expect(getValidatedMasterImportPlanRows("org-internal", "job-1", 2))
      .resolves.toEqual([4, 200]);

    expect(mocks.prisma.masterImportJob.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-internal", id: "job-1" },
      select: { id: true, expires_at: true },
    });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        plan_number: 2,
        status: "VALIDATED",
      },
      orderBy: { row_number: "asc" },
      take: 25,
      select: { row_number: true },
    });
  });

  it("commits the business row and checkpoint after changing VALIDATED to IMPORTING", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, status: "VALIDATED", total_rows: 1 })
      .mockResolvedValueOnce({ ...baseJob, status: "COMPLETED", total_rows: 1, processed_rows: 1, successful_rows: 1 });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce(rowRecord("VALIDATED", {
        rowNumber: 2,
        code: null,
        description: null,
        fields: { season: "WINTER" },
        childRows: {},
      }))
      .mockResolvedValueOnce(null);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "IMPORTED", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.createMasterValueForOrganization.mockResolvedValue({ id: "master-1" });

    const result = await commitNextMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });

    expect(mocks.createMasterValueForOrganization).toHaveBeenCalledWith(
      "org-internal",
      "season",
      expect.objectContaining({ label: "WINTER", createOnly: true }),
      mocks.prisma,
    );
    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", id: "job-1", status: "IMPORTING" },
      data: expect.objectContaining({ status: "COMPLETED", processed_rows: 1 }),
    }));
    expect(mocks.prisma.masterImportJobRow.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        job_id: "job-1",
        status: { notIn: ["IMPORTED", "FAILED", "SKIPPED"] },
      }),
    }));
    expect(mocks.prisma.masterImportJobRow.groupBy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      job: { status: "COMPLETED" },
      progress: { totalRows: 1, processedRows: 1, successfulRows: 1 },
      row: { rowNumber: 1, status: "IMPORTED" },
    });
  });

  it("allows validated rows to import while invalid rows remain for correction", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({
        ...baseJob,
        module_key: "contact",
        status: "PARTIAL",
        total_rows: 2,
        failed_rows: 1,
      })
      .mockResolvedValueOnce({
        ...baseJob,
        module_key: "contact",
        status: "PARTIAL",
        total_rows: 2,
        processed_rows: 1,
        successful_rows: 1,
        failed_rows: 1,
      });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce({
        ...rowRecord("VALIDATED", {
          contactKey: "ROW-2",
          input: { legalName: "VALID CONTACT", roles: [], taxRegistrations: [], addresses: [], bankAccounts: [] },
        }),
        row_number: 2,
      })
      .mockResolvedValueOnce({
        ...rowRecord("INVALID", {
          contactKey: "ROW-3",
          validationErrors: [{ message: "Email is invalid.", fieldPaths: ["email"] }],
        }),
        row_number: 3,
      });
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.createContact.mockResolvedValue({ id: "contact-1" });

    const result = await commitNextMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 2,
    });

    expect(mocks.createContact).toHaveBeenCalledWith(
      "org-internal",
      "actor-1",
      expect.objectContaining({ legalName: "VALID CONTACT" }),
      mocks.prisma,
    );
    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "PARTIAL",
        processed_rows: 1,
        successful_rows: 1,
        failed_rows: 1,
      }),
    }));
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(result).toMatchObject({
      job: { status: "PARTIAL" },
      progress: { totalRows: 2, processedRows: 1, successfulRows: 1, failedRows: 1 },
      row: { rowNumber: 2, status: "IMPORTED" },
    });
  });

  it("rejects a selected row that is no longer validated", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      status: "PARTIAL",
      total_rows: 2,
    });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);

    await expect(commitNextMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 2,
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.createContact).not.toHaveBeenCalled();
  });

  it("commits a selected validated row without stopping validation of other staged rows", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({
        ...baseJob,
        module_key: "contact",
        status: "STAGED",
        total_rows: 2,
      })
      .mockResolvedValueOnce({
        ...baseJob,
        module_key: "contact",
        status: "STAGED",
        total_rows: 2,
        processed_rows: 1,
        successful_rows: 1,
      });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce({
        ...rowRecord("VALIDATED", {
          contactKey: "ROW-2",
          input: { legalName: "VALID CONTACT", roles: [], taxRegistrations: [], addresses: [], bankAccounts: [] },
        }),
        row_number: 2,
      })
      .mockResolvedValueOnce({ row_number: 3 })
      .mockResolvedValueOnce({ row_number: 3 });
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.createContact.mockResolvedValue({ id: "contact-1" });

    const result = await commitNextMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 2,
    });

    expect(mocks.createContact).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", id: "job-1", status: "STAGED" },
      data: expect.objectContaining({ status: "STAGED", successful_rows: 1 }),
    }));
    expect(result).toMatchObject({
      job: { status: "STAGED" },
      progress: { processedRows: 1, successfulRows: 1 },
      row: { rowNumber: 2, status: "IMPORTED" },
    });
  });

  it("keeps validation resumable when a selected master creation fails", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({
        ...baseJob,
        module_key: "contact",
        status: "STAGED",
        total_rows: 2,
      })
      .mockResolvedValueOnce({ status: "STAGED" })
      .mockResolvedValueOnce({
        ...baseJob,
        module_key: "contact",
        status: "STAGED",
        total_rows: 2,
        processed_rows: 1,
        successful_rows: 0,
        failed_rows: 1,
      });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce({
        ...rowRecord("VALIDATED", {
          contactKey: "ROW-2",
          input: { legalName: "INVALID CONTACT", roles: [], taxRegistrations: [], addresses: [], bankAccounts: [] },
        }),
        row_number: 2,
      })
      .mockResolvedValueOnce({
        ...rowRecord("VALIDATED", {
          contactKey: "ROW-2",
          input: { legalName: "INVALID CONTACT", roles: [], taxRegistrations: [], addresses: [], bankAccounts: [] },
        }),
        row_number: 2,
      });
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "FAILED", _count: { _all: 1 } },
      { status: "STAGED", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.createContact.mockRejectedValue(Object.assign(new Error("Transaction timed out."), { code: "P2028" }));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await commitNextMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 2,
    });

    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", id: "job-1", status: "STAGED" },
      data: expect.objectContaining({ status: "STAGED", failed_rows: 1 }),
    }));
    expect(result).toMatchObject({
      job: { status: "STAGED" },
      progress: { failedRows: 1 },
      row: { rowNumber: 2, status: "FAILED" },
    });
    expect(errorLog).toHaveBeenCalledWith("Master import row commit failed.", {
      jobId: "job-1",
      rowNumber: 2,
      code: "P2028",
    });
    errorLog.mockRestore();
    const failedRowUpdate = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0];
    const failedPayload = JSON.parse(
      decryptSecret(Buffer.from(failedRowUpdate.data.encrypted_payload).toString("utf8")),
    );
    expect(failedPayload.validationErrors).toEqual([{
      message: "The database transaction could not be completed. No master changes were saved; validate this row and retry.",
      fieldPaths: [],
    }]);
  });

  it("stops the import cleanly when only invalid rows remain for correction", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      module_key: "contact",
      status: "PARTIAL",
      total_rows: 1,
      failed_rows: 1,
    });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 1 } },
    ]);

    const result = await commitNextMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });

    expect(result).toMatchObject({
      job: { status: "PARTIAL" },
      progress: { totalRows: 1, processedRows: 0, successfulRows: 0, failedRows: 1 },
      row: null,
    });
    expect(mocks.prisma.masterImportJob.updateMany).not.toHaveBeenCalled();
  });
});
