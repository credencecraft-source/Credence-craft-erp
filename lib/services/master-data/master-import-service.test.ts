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
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    masterImportRun: { updateMany: vi.fn() },
    masterImportJobFileChunk: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    organizationDummyDataBatch: { findFirst: vi.fn() },
    masterBrand: { findFirst: vi.fn(), findMany: vi.fn() },
    masterProduct: { findFirst: vi.fn(), findMany: vi.fn() },
    masterCategory: { findFirst: vi.fn(), findMany: vi.fn() },
    masterSubCategory: { findFirst: vi.fn(), findMany: vi.fn() },
    masterColor: { findFirst: vi.fn(), findMany: vi.fn() },
    masterSize: { findFirst: vi.fn(), findMany: vi.fn() },
    masterSizeGroup: { findFirst: vi.fn(), findMany: vi.fn() },
    masterSizeGroupSize: { findMany: vi.fn() },
    auditEvent: { createMany: vi.fn() },
    $executeRaw: vi.fn(),
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
  formatMasterImportCommitFailure,
  createMasterImportPlans,
  createMasterImportJob,
  deleteMasterImportJob,
  getMasterImportErrorGroupAction,
  getMasterImportErrorAnalysis,
  getMasterImportPlanProgress,
  getValidatedMasterImportPlanRows,
  getMasterImportJob,
  listMasterImportJobs,
  loadArticleImportSupportingMasterIndex,
  MASTER_IMPORT_PLAN_SIZE,
  MASTER_IMPORT_REPORT_PAGE_SIZE,
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
  const fields = typeof payload.fields === "object" && payload.fields !== null
    && !Array.isArray(payload.fields)
    ? payload.fields as Record<string, unknown>
    : {};
  const articleGroupKey = typeof fields.article === "string"
    ? createHash("sha256").update(fields.article.trim().toLocaleLowerCase()).digest("hex")
    : null;
  return {
    id: "row-1",
    organization_id: "org-internal",
    job_id: "job-1",
    row_number: 1,
    article_group_key: articleGroupKey,
    status,
    plan_number: null,
    checkpoint: null,
    encrypted_payload: Buffer.from(encryptSecret(JSON.stringify(payload))),
    updated_by_user_id: "actor-1",
    created_at: now,
    updated_at: now,
  };
}

function readSuggestionsForTest(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("validationErrors" in payload)
    || !Array.isArray(payload.validationErrors)) return [];
  return payload.validationErrors.flatMap((error: unknown) =>
    typeof error === "object" && error !== null && "relatedMasters" in error
    && Array.isArray(error.relatedMasters) ? error.relatedMasters : []);
}

describe("master import service", () => {
  it("keeps report pages at 1,000 while allowing 10,000 validations and plan rows", () => {
    expect(MASTER_IMPORT_REPORT_PAGE_SIZE).toBe(1_000);
    expect(MASTER_IMPORT_VALIDATION_BATCH_SIZE).toBe(10_000);
    expect(MASTER_IMPORT_PLAN_SIZE).toBe(1_000);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AUTH_SECRET = "focused-test-secret";
    mocks.prisma.masterImportJob.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.masterImportJobRow.count.mockResolvedValue(0);
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);
    mocks.prisma.organizationDummyDataBatch.findFirst.mockResolvedValue(null);
    for (const model of [
      mocks.prisma.masterBrand,
      mocks.prisma.masterProduct,
      mocks.prisma.masterCategory,
      mocks.prisma.masterSubCategory,
      mocks.prisma.masterColor,
      mocks.prisma.masterSize,
      mocks.prisma.masterSizeGroup,
    ]) {
      model.findFirst.mockResolvedValue(null);
      model.findMany.mockResolvedValue([]);
    }
    mocks.prisma.masterSizeGroupSize.findMany.mockResolvedValue([]);
    mocks.prisma.workspaceUser.findMany.mockResolvedValue([]);
    mocks.loadActiveMasterLookupIndex.mockResolvedValue(new Map());
    mocks.createAuditEvent.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) =>
      callback(mocks.prisma));
    mocks.prisma.masterImportRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$executeRaw.mockResolvedValue(0);
  });

  it("shows safe actionable commit failures without exposing raw database errors", () => {
    expect(formatMasterImportCommitFailure(new Error(
      "Every selected size must belong to the chosen Size Group in this organization.",
    ))).toBe("Every selected size must belong to the chosen Size Group in this organization.");
    expect(formatMasterImportCommitFailure(Object.assign(new Error("raw database message"), {
      code: "P2003",
    }))).toContain("Brand, category, subcategory, Size Group, and sizes");
    expect(formatMasterImportCommitFailure(Object.assign(new Error("sensitive engine details"), {
      name: "PrismaClientUnknownRequestError",
    }))).toBe("The record was not saved. Review the row and retry; if the issue repeats, contact your administrator.");
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

  it("stages generic workbook rows atomically without validating their field values", async () => {
    const source = new Uint8Array([80, 75, 3, 4]);
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({
        ...baseJob,
        encrypted_source_file: Buffer.from(encryptSecret(Buffer.from(source).toString("base64"))),
      })
      .mockResolvedValueOnce({ ...baseJob, status: "STAGED", total_rows: 2 });
    mocks.parseMasterRecordsWorkbook.mockResolvedValue([{
        rowNumber: 2,
        code: null,
        description: null,
        fields: { season_name: "WINTER" },
        childRows: {},
      }, {
        rowNumber: 3,
        code: null,
        description: null,
        fields: { season_name: null },
        childRows: {},
      }]);

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
      "stage",
    );
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].status).toBe("STAGED");
    expect(insertedRows[1].status).toBe("STAGED");
    expect(JSON.stringify(staged)).not.toContain("validationErrors");
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "MASTER_IMPORT_STAGED",
      details: { rowCount: 2, invalidRowCount: 0 },
    }), mocks.prisma);
  });

  it("stages every Article worksheet row without grouping or validation", async () => {
    const source = new Uint8Array([80, 75, 3, 4]);
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({
        ...baseJob,
        module_key: "article",
        encrypted_source_file: Buffer.from(encryptSecret(Buffer.from(source).toString("base64"))),
      })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED", total_rows: 3 });
    mocks.parseMasterRecordsWorkbook.mockResolvedValue([
        {
          rowNumber: 2,
          code: null,
          description: null,
          fields: { article: "P799", Category: "TOPS", Sizes: ["S"] },
          childRows: { variants: [] },
        },
        {
          rowNumber: 3,
          code: null,
          description: null,
          fields: { article: "P799", Category: "BOTTOMS", Sizes: ["M"] },
          childRows: { variants: [] },
        },
        {
          rowNumber: 4,
          code: null,
          description: null,
          fields: { article: "P800", Category: "TOPS", Sizes: ["S"] },
          childRows: { variants: [] },
        },
      ]);
    mocks.prisma.masterImportJobRow.createMany.mockResolvedValue({ count: 3 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    await stageMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });

    const stagedRows = mocks.prisma.masterImportJobRow.createMany.mock.calls[0][0].data;
    expect(stagedRows.map((row: { status: string }) => row.status)).toEqual(["STAGED", "STAGED", "STAGED"]);
    expect(stagedRows.map((row: { encrypted_payload: Uint8Array }) =>
      JSON.parse(decryptSecret(Buffer.from(row.encrypted_payload).toString("utf8"))).fields.article))
      .toEqual(["P799", "P799", "P800"]);
    expect(mocks.prisma.masterImportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ total_rows: 3, failed_rows: 0 }),
    }));
  });

  it("inserts large staged workbooks in bounded batches within one transaction", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({
        ...baseJob,
        encrypted_source_file: Buffer.from(encryptSecret(Buffer.from([80, 75, 3, 4]).toString("base64"))),
      })
      .mockResolvedValueOnce({ ...baseJob, status: "STAGED", total_rows: 5_001 });
    mocks.parseMasterRecordsWorkbook.mockResolvedValue(
      Array.from({ length: 5_001 }, (_, index) => ({
        rowNumber: index + 2,
        code: null,
        description: null,
        fields: { season_name: `SEASON ${index + 1}` },
        childRows: {},
      })),
    );
    mocks.prisma.masterImportJobRow.createMany
      .mockResolvedValueOnce({ count: 5_000 })
      .mockResolvedValueOnce({ count: 1 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    await stageMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
    });

    const batches = mocks.prisma.masterImportJobRow.createMany.mock.calls.map(([args]) => args.data);
    expect(batches.map((batch: unknown[]) => batch.length)).toEqual([5_000, 1]);
    expect(batches.flat()).toHaveLength(5_001);
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 10_000, timeout: 120_000 },
    );
  }, 30_000);

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
    mocks.parseMasterRecordsWorkbook.mockResolvedValue([{
        rowNumber: 2,
        code: "WINTER",
        description: "WINTER",
        fields: { season_name: "WINTER" },
        childRows: {},
      }]);
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
      "stage",
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
      take: 1_000,
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
      take: 1_000,
    }));
    expect(JSON.stringify(detail)).not.toContain("encrypted_payload");
    expect(JSON.stringify(detail)).not.toContain("encrypted_source_file");
  });

  it("applies requested pagination to the all-rows import report", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({ ...baseJob });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([
      rowRecord("STAGED", { Season: "WINTER" }),
    ]);
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([]);

    const detail = await getMasterImportJob("org-internal", "job-1", {
      skip: 100,
      take: 100,
      tab: "all",
    });

    expect(detail.rows).toHaveLength(1);
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", job_id: "job-1" },
      orderBy: { row_number: "asc" },
      skip: 100,
      take: 100,
    }));
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

  it("groups the same validation reason by affected rows across bounded error batches", async () => {
    const commonReason = {
      message: "Color must match an active value in this organization.",
      fieldPaths: ["variants.0.color", "variants.0.color"],
    };
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      uploaded_file_name: "articles.xlsx",
      module_key: "article",
    });
    const commonRow = rowRecord("INVALID", { validationErrors: [commonReason] });
    const firstBatch = Array.from({ length: 1_000 }, (_, index) => ({
      ...commonRow,
      row_number: index + 1,
    }));
    firstBatch[0] = {
      ...firstBatch[0],
      encrypted_payload: rowRecord("INVALID", {
        validationErrors: [commonReason, commonReason],
      }).encrypted_payload,
    };
    firstBatch[1] = {
      ...firstBatch[1],
      status: "FAILED",
      encrypted_payload: rowRecord("FAILED", {
        validationErrors: [{
          message: "  COLOR MUST MATCH AN ACTIVE VALUE IN THIS ORGANIZATION. ",
          fieldPaths: ["variants.1.color"],
        }],
      }).encrypted_payload,
    };
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([
        {
          ...rowRecord("INVALID", {
            validationErrors: [{
              message: "Brand is missing.",
              fieldPaths: ["Brand"],
            }],
          }),
          row_number: 1_001,
        },
        {
          ...rowRecord("FAILED", { fields: { article: "STYLE WITHOUT REASON" } }),
          row_number: 1_002,
        },
      ])

    const analysis = await getMasterImportErrorAnalysis("org-internal", "job-1");

    expect(analysis).toEqual({
      jobId: "job-1",
      moduleKey: "article",
      fileName: "articles.xlsx",
      totalErrorRows: 1_002,
      reasonCount: 3,
      groupedErrors: [
        {
          reason: commonReason.message,
          fields: ["variants.0.color", "variants.1.color"],
          affectedRows: 1_000,
          sampleRows: Array.from({ length: 10 }, (_, index) => index + 1),
        },
        {
          reason: "Brand is missing.",
          fields: ["Brand"],
          affectedRows: 1,
          sampleRows: [1_001],
        },
        {
          reason: "No structured validation reason is saved for this row.",
          fields: [],
          affectedRows: 1,
          sampleRows: [1_002],
        },
      ],
    });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        status: { in: ["INVALID", "FAILED"] },
        row_number: { gt: 0 },
      },
      orderBy: { row_number: "asc" },
      take: 1_000,
      select: { row_number: true, encrypted_payload: true },
    });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ row_number: { gt: 1_000 } }),
      take: 1_000,
    }));
    expect(JSON.stringify(analysis)).not.toContain("encrypted_payload");
  });

  it("loads only rows and related masters that match an Article error reason", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      module_key: "article",
    });
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([
        {
          ...rowRecord("INVALID", {
            validationErrors: [{
              message: "Brand is missing.",
              relatedMasters: [{
                moduleKey: "brand",
                label: "NORTH STAR",
                fields: { Brand: "NORTH STAR" },
              }],
            }],
          }),
          row_number: 4,
        },
        {
          ...rowRecord("FAILED", {
            validationErrors: [{
              message: "  BRAND IS MISSING. ",
              relatedMasters: [{
                moduleKey: "brand",
                label: "NORTH STAR",
                fields: { Brand: "NORTH STAR" },
              }],
            }],
          }),
          row_number: 9,
        },
        {
          ...rowRecord("INVALID", {
            validationErrors: [{
              message: "Color is missing.",
              relatedMasters: [{
                moduleKey: "color",
                label: "BLUE",
                fields: { Color: "BLUE" },
              }],
            }],
          }),
          row_number: 12,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getMasterImportErrorGroupAction(
      "org-internal",
      "job-1",
      "Brand is missing.",
    );

    expect(result).toEqual({
      rowNumbers: [4, 9],
      totalAffectedRows: 2,
      truncated: false,
      suggestions: [{
        moduleKey: "brand",
        label: "NORTH STAR",
        fields: { Brand: "NORTH STAR" },
      }],
    });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        job_id: "job-1",
        status: { in: ["INVALID", "FAILED"] },
      }),
    }));
  });

  it("rejects automatic error-group master creation for non-Article imports", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      module_key: "season",
    });

    await expect(getMasterImportErrorGroupAction(
      "org-internal",
      "job-1",
      "Season is missing.",
    )).rejects.toMatchObject({ status: 400 });
    expect(mocks.prisma.masterImportJobRow.findMany).not.toHaveBeenCalled();
  });

  it("does not return error analysis across organization boundaries", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue(null);

    await expect(getMasterImportErrorAnalysis("org-internal", "another-org-job"))
      .rejects.toMatchObject({ status: 404 });
    expect(mocks.prisma.masterImportJobRow.findMany).not.toHaveBeenCalled();
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

  it("caps one validation request at the safe 10,000-row batch limit", async () => {
    expect(MASTER_IMPORT_VALIDATION_BATCH_SIZE).toBe(10_000);
    await expect(validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumbers: Array.from({ length: 10_001 }, (_, index) => index + 1),
    })).rejects.toMatchObject({ status: 400 });
    await expect(validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      take: 10_001,
    })).rejects.toMatchObject({ status: 400 });
    expect(mocks.prisma.masterImportJob.findFirst).not.toHaveBeenCalled();
  });

  it("validates a bounded staged-only batch without selecting existing Errors", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      module_key: "season",
      status: "STAGED",
    });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([
      rowRecord("STAGED", {
        rowNumber: 1,
        fields: { season: "SUMMER" },
        childRows: {},
      }),
      {
        ...rowRecord("CORRECTED", {
          rowNumber: 2,
          fields: { season: "WINTER" },
          childRows: {},
        }),
        id: "row-2",
        row_number: 2,
        status: "CORRECTED",
      },
    ]);
    mocks.loadActiveMasterLookupIndex.mockResolvedValue(new Map());
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 2 } },
    ]);

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      take: 2,
    });

    expect(result.processedRowCount).toBe(2);
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        status: { in: ["STAGED", "CORRECTED"] },
      },
      orderBy: { row_number: "asc" },
      take: 2,
    }));
  });

  it("marks a row invalid immediately when its required master lookup is missing", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      module_key: "location",
      status: "STAGED",
    });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValueOnce([
      {
        ...rowRecord("STAGED", { location_name: "HQ", entity_id: "missing-entity" }),
        row_number: 1,
      },
    ]);
    mocks.loadActiveMasterLookupIndex.mockResolvedValue(new Map());
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 1 } },
    ]);

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    expect(result.validatedRowNumbers).toEqual([]);
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalled();
    expect(mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0]).toMatchObject({
      where: { organization_id: "org-internal", job_id: "job-1", row_number: 1 },
      data: { status: "INVALID" },
    });
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

  it("revalidates an invalid error row and removes its old plan assignment", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, status: "VALIDATED", total_rows: 1 });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValue([{
      ...rowRecord("INVALID", {
        rowNumber: 1,
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
        status: { in: ["STAGED", "CORRECTED", "INVALID", "FAILED"] },
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

  it("keeps Article matrix conflicts invalid until the row is corrected", async () => {
    const groupingError = {
      message: 'Article "P799" has conflicting Category values in spreadsheet rows 2, 3.',
      fieldPaths: ["Category"],
    };
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "PARTIAL", total_rows: 1 });
    const firstRow = {
      ...rowRecord("STAGED", {
        rowNumber: 2,
        fields: { article: "P799", Category: "TOPS" },
        childRows: {},
      }),
      row_number: 1,
    };
    const secondRow = {
      ...rowRecord("STAGED", {
        rowNumber: 3,
        fields: { article: "P799", Category: "BOTTOMS" },
        childRows: {},
      }),
      id: "row-2",
      row_number: 2,
    };
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([firstRow])
      .mockResolvedValueOnce([firstRow, secondRow]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 2 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    const saved = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0].data;
    const savedPayload = JSON.parse(decryptSecret(Buffer.from(saved.encrypted_payload).toString("utf8")));
    expect(saved.status).toBe("INVALID");
    expect(saved.checkpoint).toBe("ARTICLE_MATRIX_CONFLICT");
    expect(savedPayload.validationErrors).toEqual([groupingError]);
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        job_id: "job-1",
        article_group_key: {
          in: [createHash("sha256").update("p799").digest("hex")],
        },
      }),
    }));
    expect(result).toMatchObject({
      job: { status: "PARTIAL" },
      validatedRowNumbers: [],
      progress: { failedRows: 2 },
    });
  });

  it("backfills legacy Article grouping keys before using the indexed row lookup", async () => {
    const legacyRow = {
      ...rowRecord("STAGED", {
        rowNumber: 1,
        fields: { article: "LEGACY STYLE" },
        childRows: {},
      }),
      article_group_key: null,
    };
    const indexedRow = {
      ...legacyRow,
      article_group_key: createHash("sha256").update("legacy style").digest("hex"),
    };
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "VALIDATED", total_rows: 1 });
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([legacyRow])
      .mockResolvedValueOnce([legacyRow])
      .mockResolvedValueOnce([indexedRow]);
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValueOnce({ id: "row-1" });
    mocks.prisma.$executeRaw.mockResolvedValueOnce(1);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    expect(result.processedRowCount).toBe(1);
    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        job_id: "job-1",
        article_group_key: {
          in: [createHash("sha256").update("legacy style").digest("hex")],
        },
      }),
    }));
  });

  it("consolidates valid Article matrix rows during explicit validation", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "PARTIAL", total_rows: 1 });
    const sharedFields = {
      article: "FW66",
      Brand: "LABEL",
      Product_Master: "TYPE",
      Category: "CATEGORY",
      Subcategory: "SUBCATEGORY",
      Size_Group: "S,M",
    };
    const firstRow = {
      ...rowRecord("STAGED", {
        rowNumber: 2,
        fields: { ...sharedFields, Sizes: ["S"], default_price: "125.00" },
        childRows: { variants: [{ color: "BLACK", variant_code: null, sku: null, price_override: null }] },
      }),
      row_number: 1,
    };
    const secondRow = {
      ...rowRecord("STAGED", {
        rowNumber: 3,
        fields: { ...sharedFields, Sizes: ["M"], default_price: "135.50" },
        childRows: { variants: [{ color: "BLACK", variant_code: null, sku: null, price_override: null }] },
      }),
      id: "row-2",
      row_number: 2,
    };
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([firstRow])
      .mockResolvedValueOnce([firstRow, secondRow]);
    mocks.prisma.masterImportJobRow.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);

    await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    expect(mocks.prisma.masterImportJobRow.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        id: { in: ["row-2"] },
        status: { in: ["STAGED"] },
      },
    });
    const updateData = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0].data;
    const savedPayload = JSON.parse(decryptSecret(Buffer.from(updateData.encrypted_payload).toString("utf8")));
    expect(savedPayload.fields).toMatchObject({
      default_price: null,
      Size_Prices: [
        { size: "S", price: "125.00" },
        { size: "M", price: "135.50" },
      ],
    });
    expect(mocks.prisma.auditEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: "MASTER_IMPORT_ARTICLE_ROWS_CONSOLIDATED",
          entity_id: "row-2",
          details: expect.objectContaining({
            consolidatedIntoRowId: "row-1",
            consolidatedIntoRowNumber: 1,
          }),
        }),
      ]),
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

  it("prefetches Article supporting masters once for a selected validation batch", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "PARTIAL", total_rows: 2 });
    const rows = [
      rowRecord("STAGED", {
        rowNumber: 2,
        fields: { article: "FW101", Brand: "BRAND A" },
        childRows: { variants: [] },
      }),
      {
        ...rowRecord("STAGED", {
          rowNumber: 3,
          fields: { article: "FW102", Brand: "BRAND B" },
          childRows: { variants: [] },
        }),
        id: "row-2",
        row_number: 2,
      },
    ];
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 2 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumbers: [1, 2],
    });

    expect(result.validatedRowNumbers).toEqual([]);
    expect(mocks.loadActiveMasterLookupIndex).not.toHaveBeenCalled();
    expect(mocks.prisma.masterBrand.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterBrand.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        OR: expect.arrayContaining([
          { brand: { equals: "BRAND A", mode: "insensitive" } },
          { brand: { equals: "BRAND B", mode: "insensitive" } },
        ]),
      }),
    }));
    expect(mocks.prisma.masterBrand.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportJobRow.findMany.mock.calls[1][0].select).toEqual({
      id: true,
      row_number: true,
      status: true,
      article_group_key: true,
      encrypted_payload: true,
    });
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalledTimes(2);
  });

  it("loads Article support lookups once for all rows in a bounded workbook batch", async () => {
    await loadArticleImportSupportingMasterIndex("org-internal", [
      { fields: { Brand: "BRAND A", Product_Master: "TYPE A" }, childRows: { variants: [{ color: "NAVY" }] } },
      { fields: { Brand: "BRAND B", Product_Master: "TYPE B" }, childRows: { variants: [{ color: "BLACK" }] } },
    ]);

    expect(mocks.prisma.organizationDummyDataBatch.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterBrand.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterBrand.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        OR: expect.arrayContaining([
          { brand: { equals: "BRAND A", mode: "insensitive" } },
          { brand: { equals: "BRAND B", mode: "insensitive" } },
        ]),
      }),
    }));
    expect(mocks.prisma.masterProduct.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterColor.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterBrand.findFirst).not.toHaveBeenCalled();
  });

  it("writes large validation batches with bounded set-based row updates", async () => {
    const rows = Array.from({ length: 550 }, (_, index) => ({
      ...rowRecord("STAGED", {
        rowNumber: index + 1,
        fields: { season: `SEASON ${index + 1}` },
        childRows: {},
      }),
      id: `row-${index + 1}`,
      row_number: index + 1,
    }));
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, status: "VALIDATED", total_rows: 550 });
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValueOnce(rows);
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 550 } },
    ]);
    mocks.prisma.masterImportJobRow.findFirst.mockResolvedValue(null);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$executeRaw.mockResolvedValueOnce(500).mockResolvedValueOnce(50);

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumbers: rows.map((row) => row.row_number),
      runProgress: { runId: "run-1", expectedProgress: 0 },
    });

    expect(result.validatedRowNumbers).toHaveLength(550);
    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.masterImportJobRow.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportRun.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-internal",
        job_id: "job-1",
        id: "run-1",
        status: "RUNNING",
        progress: 0,
      },
      data: expect.objectContaining({
        progress: { increment: 550 },
        lease_expires_at: expect.any(Date),
        updated_at: expect.any(Date),
      }),
    });
    expect(mocks.prisma.auditEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ entity_id: "row-1", action: "MASTER_IMPORT_ROW_VALIDATED" }),
        expect.objectContaining({ entity_id: "row-550", action: "MASTER_IMPORT_ROW_VALIDATED" }),
      ]),
    });
  }, 30_000);

  it("stops Article validation at the first missing master instead of continuing through all related suggestions", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "PARTIAL", total_rows: 1 });
    const stagedArticleRow = rowRecord("STAGED", {
        rowNumber: 2,
        fields: {
          article: "FW66",
          Brand: "NEW LABEL",
          Product_Master: "NEW TYPE",
          Category: "NEW CATEGORY",
          Subcategory: "NEW SUBCATEGORY",
          Sizes: ["S", "M"],
          Size_Group: "S,M",
        },
        childRows: {
          variants: [{ color: "BLACK", variant_code: null, sku: null, price_override: null }],
        },
      });
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([stagedArticleRow])
      .mockResolvedValueOnce([stagedArticleRow]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    expect(result).toMatchObject({ validatedRowNumbers: [], job: { status: "PARTIAL" }, progress: { totalRows: 1 } });
    expect(mocks.createMasterValueForOrganization).not.toHaveBeenCalled();
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "INVALID" }),
    }));
    const update = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0];
    const savedPayload = JSON.parse(decryptSecret(Buffer.from(update.data.encrypted_payload).toString("utf8")));
    const relatedMasters = savedPayload.validationErrors.flatMap(
      (validationError: { relatedMasters?: Array<{ moduleKey: string; label: string; fields: Record<string, unknown> }> }) =>
        validationError.relatedMasters ?? [],
    );
    expect(savedPayload.validationErrors.map((validationError: { message: string }) => validationError.message).join(" "))
      .toContain('Brand "NEW LABEL" is missing. Create this Brand before retrying the Article.');
    expect(relatedMasters).toEqual([
      expect.objectContaining({ moduleKey: "brand", label: "NEW LABEL" }),
    ]);
    expect(relatedMasters.some(({ moduleKey, label }: { moduleKey: string; label: string }) =>
      moduleKey === "size-group" && label.includes("NEW LABEL S-M"))).toBe(false);
  });

  it("suggests a new Size Group when an existing group has a different size set", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "PARTIAL", total_rows: 1 });
    const stagedArticleRow = rowRecord("STAGED", {
      rowNumber: 2,
      fields: { article: "FW99", Brand: "ACME", Sizes: ["S", "M"], Size_Group: "CORE" },
      childRows: {},
    });
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([stagedArticleRow])
      .mockResolvedValueOnce([stagedArticleRow]);
    mocks.prisma.masterBrand.findMany.mockResolvedValue([{
      id: "brand-1",
      brand: "ACME",
      is_active: true,
      legacy_metadata: null,
    }]);
    mocks.prisma.masterSize.findMany.mockResolvedValue(["S", "M"].map((label) => ({
        id: `size-${label.toLowerCase()}`,
        size: label,
        is_active: true,
        legacy_metadata: null,
      })));
    mocks.prisma.masterSizeGroup.findMany.mockResolvedValue([{
      id: "group-core",
      size_group: "CORE",
      brand_id: "brand-1",
      is_active: true,
      legacy_metadata: null,
    }]);
    mocks.prisma.masterSizeGroupSize.findMany.mockResolvedValue([{
      size_group_id: "group-core",
      size: { id: "size-s", organization_id: "org-internal" },
    }, {
      size_group_id: "group-core",
      size: { id: "size-m", organization_id: "org-internal" },
    }, {
      size_group_id: "group-core",
      size: { id: "size-xl", organization_id: "org-internal" },
    }]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "INVALID", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    const update = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0];
    const savedPayload = JSON.parse(decryptSecret(Buffer.from(update.data.encrypted_payload).toString("utf8")));
    const suggestions = readSuggestionsForTest(savedPayload);
    expect(update.data.status).toBe("INVALID");
    expect(mocks.prisma.masterSizeGroupSize.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        size_group_id: { in: ["group-core"] },
      }),
      select: {
        size_group_id: true,
        size: { select: { id: true, organization_id: true } },
      },
    }));
    expect(suggestions).toContainEqual(expect.objectContaining({
      moduleKey: "size-group",
      label: "CORE S-M",
      fields: { Brand1: "ACME", Size_Group: "CORE S-M", Size: ["S", "M"] },
      articleFieldUpdates: { Size_Group: "CORE S-M" },
    }));
  });

  it("reuses a same-brand Size Group with the exact size set regardless of order or group name", async () => {
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "STAGED" })
      .mockResolvedValueOnce({ ...baseJob, module_key: "article", status: "PARTIAL", total_rows: 1 });
    const matchingSizes = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
    const stagedArticleRow = rowRecord("STAGED", {
      rowNumber: 2,
      fields: { article: "FW99", Brand: "ACME", Sizes: matchingSizes, Size_Group: "CORE" },
      childRows: {},
    });
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([stagedArticleRow])
      .mockResolvedValueOnce([stagedArticleRow]);
    mocks.prisma.masterBrand.findMany.mockResolvedValue([{
      id: "brand-1",
      brand: "ACME",
      is_active: true,
      legacy_metadata: null,
    }]);
    mocks.prisma.masterSize.findMany.mockResolvedValue(matchingSizes.map((label) => ({
      id: `size-${label.toLowerCase()}`,
      size: label,
      is_active: true,
      legacy_metadata: null,
    })));
    mocks.prisma.masterSizeGroup.findMany.mockResolvedValue([
      {
        id: "group-core",
        size_group: "CORE",
        brand_id: "brand-1",
        is_active: true,
        legacy_metadata: null,
      },
      {
        id: "group-existing",
        size_group: "ETIQUETTE",
        brand_id: "brand-1",
        is_active: true,
        legacy_metadata: null,
      },
    ]);
    mocks.prisma.masterSizeGroupSize.findMany.mockResolvedValue([
      ...[...matchingSizes].reverse().map((size) => ({
        size_group_id: "group-existing",
        size: { id: `size-${size.toLowerCase()}`, organization_id: "org-internal" },
      })),
    ]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 1 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    await validateMasterImportJob({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
    });

    const update = mocks.prisma.masterImportJobRow.updateMany.mock.calls[0][0];
    const savedPayload = JSON.parse(decryptSecret(Buffer.from(update.data.encrypted_payload).toString("utf8")));
    expect(savedPayload.validationErrors).toEqual([]);
    expect(update.data.status).toBe("VALIDATED");
    expect(savedPayload.fields.Size_Group).toBe("ETIQUETTE");
  });

  it("auto-revalidates sibling rows that share the exact same validation problem after a fix", async () => {
    const invalidPayload = {
      rowNumber: 1,
      fields: { season: "SUMMER" },
      childRows: {},
      validationErrors: [{ message: "Season is missing.", fieldPaths: ["season"] }],
    };
    const matchingInvalidPayload = {
      rowNumber: 2,
      fields: { season: "AUTUMN" },
      childRows: {},
      validationErrors: [{ message: "Season is missing.", fieldPaths: ["season"] }],
    };

    const correctedRow = {
      ...rowRecord("STAGED", { rowNumber: 1, fields: { season: "SUMMER" }, childRows: {} }),
      id: "row-1",
      row_number: 1,
      status: "STAGED",
    };
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({ ...baseJob, module_key: "season", status: "PARTIAL" });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce({
        ...rowRecord("INVALID", invalidPayload),
        id: "row-1",
        row_number: 1,
        status: "INVALID",
      })
      .mockResolvedValueOnce(correctedRow);
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([
        { row_number: 2, encrypted_payload: Buffer.from(encryptSecret(JSON.stringify(matchingInvalidPayload))) },
      ])
      .mockResolvedValueOnce([
        {
          ...rowRecord("STAGED", { rowNumber: 1, fields: { season: "SUMMER" }, childRows: {} }),
          id: "row-1",
          row_number: 1,
          status: "STAGED",
        },
        {
          ...rowRecord("INVALID", matchingInvalidPayload),
          id: "row-2",
          row_number: 2,
          status: "INVALID",
        },
      ]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([
      { status: "VALIDATED", _count: { _all: 2 } },
    ]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    await expect(saveMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
      payload: { rowNumber: 1, fields: { season: "SUMMER" }, childRows: {} },
    })).resolves.toMatchObject({ rowNumber: 1, status: "STAGED" });

    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-internal",
        job_id: "job-1",
        status: { in: ["INVALID", "FAILED"] },
        row_number: { not: 1 },
      }),
    }));
    expect(mocks.prisma.masterImportJobRow.updateMany).toHaveBeenCalled();
  });

  it("returns exact matching error rows for background revalidation without validating synchronously", async () => {
    const invalidPayload = {
      rowNumber: 1,
      fields: { season: "SUMMER" },
      childRows: {},
      validationErrors: [{ message: "Season is missing.", fieldPaths: ["season"] }],
    };
    const matchingPayload = {
      rowNumber: 2,
      fields: { season: "AUTUMN" },
      childRows: {},
      validationErrors: [{ message: "Season is missing.", fieldPaths: ["season"] }],
    };
    const correctedRow = {
      ...rowRecord("STAGED", { rowNumber: 1, fields: { season: "SUMMER" }, childRows: {} }),
      id: "row-1",
      row_number: 1,
      status: "STAGED",
    };
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValueOnce({ module_key: "season" })
      .mockResolvedValueOnce({ id: "job-1", status: "PARTIAL", expires_at: baseJob.expires_at });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce({
        ...rowRecord("INVALID", invalidPayload),
        id: "row-1",
        row_number: 1,
        status: "INVALID",
      })
      .mockResolvedValueOnce(correctedRow);
    mocks.prisma.masterImportJobRow.findMany.mockResolvedValueOnce([{
      row_number: 2,
      encrypted_payload: Buffer.from(encryptSecret(JSON.stringify(matchingPayload))),
    }]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([{ status: "STAGED", _count: { _all: 1 } }]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const saved = await saveMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
      payload: { rowNumber: 1, fields: { season: "SUMMER" }, childRows: {} },
      deferMatchingRevalidation: true,
    });

    expect(saved).toMatchObject({ rowNumber: 1, relatedRowNumbers: [2] });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledTimes(1);
  });

  it("applies the chosen Size Group to exact matching Article rows before deferred revalidation", async () => {
    const validationErrors = [{
      message: 'No organization Size Group contains every required size (S, M). Create Size Group "CORE S-M" for Brand "ACME" containing all of those sizes, then retry the Article.',
      fieldPaths: ["Size_Group", "Sizes", "Brand"],
    }];
    const sourcePayload = {
      rowNumber: 1,
      fields: { Brand: "ACME", Size_Group: "CORE S-M", Sizes: ["S", "M"] },
      childRows: {},
      validationErrors,
    };
    const siblingPayload = {
      ...sourcePayload,
      rowNumber: 2,
    };
    const savedRow = (rowNumber: number) => ({
      ...rowRecord("STAGED", { rowNumber, fields: {}, childRows: {} }),
      id: `row-${rowNumber}`,
      row_number: rowNumber,
      status: "STAGED",
    });
    mocks.prisma.masterImportJob.findFirst
      .mockResolvedValue({ module_key: "article", id: "job-1", status: "PARTIAL", expires_at: baseJob.expires_at });
    mocks.prisma.masterImportJobRow.findFirst
      .mockResolvedValueOnce({
        ...rowRecord("INVALID", sourcePayload),
        id: "row-1",
        row_number: 1,
        status: "INVALID",
      })
      .mockResolvedValueOnce(savedRow(1))
      .mockResolvedValueOnce({
        ...rowRecord("INVALID", siblingPayload),
        id: "row-2",
        row_number: 2,
        status: "INVALID",
      })
      .mockResolvedValueOnce(savedRow(2));
    mocks.prisma.masterImportJobRow.findMany
      .mockResolvedValueOnce([{
        row_number: 2,
        encrypted_payload: Buffer.from(encryptSecret(JSON.stringify(siblingPayload))),
      }])
      .mockResolvedValueOnce([]);
    mocks.prisma.masterImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.masterImportJobRow.groupBy.mockResolvedValue([{ status: "STAGED", _count: { _all: 1 } }]);
    mocks.prisma.masterImportJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await saveMasterImportRow({
      organizationId: "org-internal",
      actorUserId: "actor-1",
      jobId: "job-1",
      rowNumber: 1,
      payload: { ...sourcePayload, validationErrors: undefined },
      deferMatchingRevalidation: true,
      relatedSizeGroupUpdate: { name: "CORE SIZE SET", sizes: ["S", "M"] },
    });

    expect(result.relatedRowNumbers).toEqual([2]);
    const siblingUpdate = mocks.prisma.masterImportJobRow.updateMany.mock.calls[1][0];
    const updatedSiblingPayload = JSON.parse(
      decryptSecret(Buffer.from(siblingUpdate.data.encrypted_payload).toString("utf8")),
    );
    expect(updatedSiblingPayload.fields).toMatchObject({
      Size_Group: "CORE SIZE SET",
      Sizes: ["S", "M"],
    });
    expect(mocks.prisma.masterImportJobRow.findMany).toHaveBeenCalledTimes(2);
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

    expect(MASTER_IMPORT_PLAN_SIZE).toBe(1_000);
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
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000),
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

  it("rejects plan progress for an expired import job", async () => {
    mocks.prisma.masterImportJob.findFirst.mockResolvedValue({
      ...baseJob,
      expires_at: new Date(Date.now() - 1),
    });

    await expect(getMasterImportPlanProgress("org-internal", "job-1", 3))
      .rejects.toMatchObject({ message: "Import job has expired.", status: 410 });
    expect(mocks.prisma.masterImportJobRow.groupBy).not.toHaveBeenCalled();
  });

  it("creates separate plans for each planning action and never exceeds 1,000 rows", async () => {
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

  it("splits a single planning action into plans containing at most 1,000 records", async () => {
    const plannedRows = Array.from({ length: 2_002 }, (_, index) => ({
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
      { planNumber: 1, recordCount: 1_000 },
      { planNumber: 2, recordCount: 1_000 },
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
