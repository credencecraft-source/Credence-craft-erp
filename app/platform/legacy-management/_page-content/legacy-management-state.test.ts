import { describe, expect, it } from "vitest";

import {
  applyDryRunResult,
  applyExecutionFailure,
  applyExecutionResult,
  applyTaskRefreshResult,
  createInitialLegacyManagementTasks,
} from "./legacy-management-state";

describe("legacy management task transitions", () => {
  it("applies server dry-run metrics to only the selected task", () => {
    const [contactTask, orderTask] = createInitialLegacyManagementTasks();
    const dryRunTask = applyDryRunResult(contactTask, {
      totalEligible: 330,
      previouslyProcessed: 120,
      sampleChanges: [{ subject: "Contact address state code", from: "MISSING", to: "29" }],
      skippedCount: 4,
    });

    expect(dryRunTask).toMatchObject({
      totalRecords: 454,
      executed: 120,
      balance: 330,
      eligibleCount: 330,
      skippedCount: 4,
      status: "DRY_RUN_PASSED",
    });
    expect(orderTask).toMatchObject({
      totalRecords: null,
      executed: 0,
      balance: null,
      skippedCount: null,
      status: "PENDING",
    });
  });

  it("applies execution results without exceeding the dry-run balance", () => {
    const contactTask = createInitialLegacyManagementTasks()[0];
    const dryRunTask = applyDryRunResult(contactTask, {
      totalEligible: 450,
      previouslyProcessed: 0,
      sampleChanges: [],
      skippedCount: 0,
    });
    const completedTask = applyExecutionResult(dryRunTask, {
      processedCount: 450,
      skippedCount: 0,
      status: "SUCCESS",
    });

    expect(completedTask).toMatchObject({
      totalRecords: 450,
      executed: 450,
      balance: 0,
      status: "COMPLETED",
    });
  });

  it("uses refreshed server metrics and task status", () => {
    const task = createInitialLegacyManagementTasks()[0];

    const refreshedTask = applyTaskRefreshResult(task, {
      taskId: task.id,
      totalEligible: 0,
      previouslyProcessed: 12,
      sampleChanges: [],
      skippedCount: 0,
      status: "COMPLETED",
    });

    expect(refreshedTask).toMatchObject({
      totalRecords: 12,
      executed: 12,
      balance: 0,
      skippedCount: 0,
      status: "COMPLETED",
    });
  });

  it("preserves skipped records as a partial completion", () => {
    const contactTask = createInitialLegacyManagementTasks()[0];
    const dryRunTask = applyDryRunResult(contactTask, {
      totalEligible: 8,
      previouslyProcessed: 0,
      sampleChanges: [],
      skippedCount: 2,
    });
    const partialTask = applyExecutionResult(dryRunTask, {
      processedCount: 8,
      skippedCount: 2,
      status: "PARTIAL",
    });

    expect(partialTask).toMatchObject({
      executed: 8,
      balance: 0,
      skippedCount: 2,
      status: "PARTIAL",
    });
  });

  it("keeps a safe failure reason visible until a later dry run succeeds", () => {
    const task = createInitialLegacyManagementTasks()[0];
    const failedTask = applyExecutionFailure(
      task,
      "The platform audit-log database schema is unavailable.",
    );

    expect(failedTask).toMatchObject({
      status: "FAILED",
      failureReason: "The platform audit-log database schema is unavailable.",
    });

    const retriedTask = applyDryRunResult(failedTask, {
      totalEligible: 1,
      previouslyProcessed: 0,
      sampleChanges: [],
      skippedCount: 0,
    });
    expect(retriedTask).toMatchObject({
      status: "DRY_RUN_PASSED",
      failureReason: null,
    });
  });
});
