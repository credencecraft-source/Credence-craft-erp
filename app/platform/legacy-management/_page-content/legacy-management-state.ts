import {
  LEGACY_MANAGEMENT_TASKS,
  type LegacyManagementDryRunResult,
  type LegacyManagementExecutionResult,
  type LegacyManagementStatus,
  type LegacyManagementTaskId,
  type LegacyManagementTaskRefreshResult,
} from "@/lib/services/platform/legacy-management-contract";

export type LegacyManagementTaskRow = {
  id: LegacyManagementTaskId;
  name: string;
  targetModule: string;
  totalRecords: number | null;
  executed: number;
  balance: number | null;
  eligibleCount: number | null;
  skippedCount: number | null;
  failureReason: string | null;
  status: LegacyManagementStatus;
};

export function createInitialLegacyManagementTasks(): LegacyManagementTaskRow[] {
  return LEGACY_MANAGEMENT_TASKS.map((task) => ({
    id: task.id,
    name: task.name,
    targetModule: task.targetModule,
    totalRecords: null,
    executed: 0,
    balance: null,
    eligibleCount: null,
    skippedCount: null,
    failureReason: null,
    status: "PENDING",
  }));
}

export function applyDryRunResult(
  task: LegacyManagementTaskRow,
  result: LegacyManagementDryRunResult,
): LegacyManagementTaskRow {
  return {
    ...task,
    totalRecords: result.previouslyProcessed + result.totalEligible + result.skippedCount,
    executed: result.previouslyProcessed,
    balance: result.totalEligible,
    eligibleCount: result.totalEligible,
    skippedCount: result.skippedCount,
    failureReason: null,
    status: "DRY_RUN_PASSED",
  };
}

export function applyTaskRefreshResult(
  task: LegacyManagementTaskRow,
  result: LegacyManagementTaskRefreshResult,
): LegacyManagementTaskRow {
  return {
    ...applyDryRunResult(task, result),
    status: result.status,
  };
}

export function applyExecutionResult(
  task: LegacyManagementTaskRow,
  result: LegacyManagementExecutionResult,
): LegacyManagementTaskRow {
  const processedCount = result.processedCount;
  const status: LegacyManagementStatus = result.status === "SUCCESS"
    ? "COMPLETED"
    : result.status === "PARTIAL"
      ? "PARTIAL"
      : "FAILED";

  return {
    ...task,
    totalRecords: Math.max(
      task.totalRecords ?? 0,
      task.executed + processedCount + result.skippedCount,
    ),
    executed: task.executed + processedCount,
    balance: Math.max(0, (task.balance ?? 0) - processedCount),
    eligibleCount: Math.max(0, (task.eligibleCount ?? 0) - processedCount),
    skippedCount: result.skippedCount,
    status,
  };
}

export function applyExecutionFailure(
  task: LegacyManagementTaskRow,
  failureReason: string,
): LegacyManagementTaskRow {
  return { ...task, failureReason, status: "FAILED" };
}
