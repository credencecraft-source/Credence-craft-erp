import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    masterImportRun: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  createAuditEvent: vi.fn(),
  getMasterImportValidationContext: vi.fn(),
  validateMasterImportJob: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));
vi.mock("@/lib/services/master-data/master-import-service", () => ({
  MasterImportServiceError: class MasterImportServiceError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
      this.name = "MasterImportServiceError";
    }
  },
  MASTER_IMPORT_PLAN_SIZE: 1_000,
  MASTER_IMPORT_VALIDATION_BATCH_SIZE: 10_000,
  MASTER_IMPORT_VALIDATION_RUN_BATCH_SIZE: 100,
  commitNextMasterImportRow: vi.fn(),
  createMasterImportPlans: vi.fn(),
  getMasterImportCommitLookupIndex: vi.fn(),
  getMasterImportValidationContext: mocks.getMasterImportValidationContext,
  getMasterImportPlanProgress: vi.fn(),
  getValidatedMasterImportPlanRows: vi.fn(),
  stageMasterImportJob: vi.fn(),
  validateMasterImportJob: mocks.validateMasterImportJob,
}));

import {
  cancelMasterImportRun,
  enqueueMasterImportRun,
  runMasterImportWorkerBatch,
} from "./master-import-run-service";

function createValidationRun(rowNumbers: number[]) {
  return {
    id: "run-1",
    organization_id: "org-1",
    job_id: "job-1",
    operation: "VALIDATE",
    status: "RUNNING",
    input: { rowNumbers },
    progress: 0,
    total: rowNumbers.length,
    attempt_count: 1,
    last_error: null as string | null,
    requested_by_user_id: "user-1",
    created_at: new Date(),
    updated_at: new Date(),
    started_at: new Date(),
    completed_at: null,
  };
}

describe("master import validation worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) => callback({
      masterImportRun: {
        findFirst: mocks.prisma.masterImportRun.findFirst,
        updateMany: mocks.prisma.masterImportRun.updateMany,
      },
    }));
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ organization_id: "org-1", id: "run-1" }])
      .mockResolvedValueOnce([]);
    mocks.prisma.masterImportRun.findFirst.mockResolvedValue(
      createValidationRun(Array.from({ length: 250 }, (_, index) => index + 1)),
    );
    mocks.prisma.masterImportRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.getMasterImportValidationContext.mockResolvedValue({
      moduleKey: "season",
      lookupIndex: new Map(),
    });
    mocks.validateMasterImportJob.mockResolvedValue({});
  });

  it("validates non-article rows in 100-row batches with resumable progress checkpoints", async () => {
    const result = await runMasterImportWorkerBatch();

    expect(result).toEqual({ claimedRuns: 1, completedRuns: 1, failedRuns: 0 });
    expect(mocks.getMasterImportValidationContext).toHaveBeenCalledTimes(1);
    expect(mocks.validateMasterImportJob).toHaveBeenCalledTimes(3);
    expect(mocks.validateMasterImportJob.mock.calls.map(([input]) => input.rowNumbers.length))
      .toEqual([100, 100, 50]);
    expect(mocks.validateMasterImportJob.mock.calls.map(([input]) => input.runProgress.expectedProgress))
      .toEqual([0, 100, 200]);
    expect(mocks.validateMasterImportJob.mock.calls.every(([input]) => input.lookupIndex instanceof Map))
      .toBe(true);
    expect(mocks.prisma.masterImportRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "run-1", status: "RUNNING" }),
      data: expect.objectContaining({ status: "COMPLETED", lease_expires_at: null }),
    }));
  });

  it("keeps article matrix validation together to preserve cross-row grouping", async () => {
    const run = createValidationRun(Array.from({ length: 250 }, (_, index) => index + 1));
    mocks.prisma.masterImportRun.findFirst.mockResolvedValue(run);
    mocks.getMasterImportValidationContext.mockResolvedValue({ moduleKey: "article" });

    await runMasterImportWorkerBatch();

    expect(mocks.validateMasterImportJob).toHaveBeenCalledTimes(1);
    expect(mocks.validateMasterImportJob.mock.calls[0][0].rowNumbers).toHaveLength(250);
  });

  it("stops between validation batches after a run is cancelled", async () => {
    const run = createValidationRun(Array.from({ length: 250 }, (_, index) => index + 1));
    mocks.prisma.masterImportRun.findFirst.mockResolvedValue(run);
    mocks.validateMasterImportJob.mockImplementation(async () => {
      run.status = "FAILED";
      run.last_error = "Cancelled by user.";
      return {};
    });

    const result = await runMasterImportWorkerBatch();

    expect(result).toEqual({ claimedRuns: 1, completedRuns: 0, failedRuns: 0 });
    expect(mocks.validateMasterImportJob).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.masterImportRun.updateMany).not.toHaveBeenCalled();
  });

  it("audits and marks an active validation run as cancelled", async () => {
    const run = createValidationRun([1, 2, 3]);
    mocks.prisma.masterImportRun.findFirst.mockResolvedValue(run);
    mocks.prisma.masterImportRun.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(run, data);
      return { count: 1 };
    });

    const result = await cancelMasterImportRun({
      organizationId: "org-1",
      actorUserId: "user-1",
      jobId: "job-1",
      runId: "run-1",
    });

    expect(result.run.status).toBe("CANCELLED");
    expect(result.run.progress).toBe(0);
    expect(mocks.prisma.masterImportRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        job_id: "job-1",
        id: "run-1",
        status: { in: ["QUEUED", "RUNNING"] },
      }),
      data: expect.objectContaining({
        status: "FAILED",
        last_error: "Cancelled by user.",
        lease_expires_at: null,
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "MASTER_IMPORT_RUN_CANCELLED",
      entityId: "run-1",
    }), expect.any(Object));
  });

  it("claims only the requested organization, job, and run when processing from the report", async () => {
    await runMasterImportWorkerBatch({
      organizationId: "org-1",
      jobId: "job-1",
      runId: "run-1",
      timeBudgetMs: 1_000,
    });

    const claimQuery = mocks.prisma.$queryRaw.mock.calls[0][0];
    expect(claimQuery.values).toEqual(expect.arrayContaining(["org-1", "job-1", "run-1"]));
  });

  it("queues a plan for selected validated rows", async () => {
    const createdRun = {
      id: "run-plan-1",
      job_id: "job-1",
      operation: "PLAN",
      status: "QUEUED",
      progress: 0,
      total: 2,
      attempt_count: 0,
      last_error: null,
      created_at: new Date(),
      updated_at: new Date(),
      started_at: null,
      completed_at: null,
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "job-1" }]),
      masterImportJob: {
        findFirst: vi.fn().mockResolvedValue({
          status: "VALIDATED",
          expires_at: new Date(Date.now() + 60_000),
        }),
      },
      masterImportRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdRun),
      },
    };
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(transaction));

    const result = await enqueueMasterImportRun({
      organizationId: "org-1",
      actorUserId: "user-1",
      jobId: "job-1",
      operation: "PLAN",
      rowNumbers: [4, 9],
    });

    expect(transaction.masterImportRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        operation: "PLAN",
        input: { rowNumbers: [4, 9] },
        total: 2,
      }),
    }));
    expect(result.run).toMatchObject({ id: "run-plan-1", operation: "PLAN", total: 2 });
  });
});
