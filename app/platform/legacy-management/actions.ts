"use server";

import {
  dryRunLegacyManagementTask,
  executeLegacyManagementTask,
  refreshLegacyManagementTasks,
} from "@/lib/services/platform/legacy-management-service";
import type {
  LegacyManagementDryRunResult,
  LegacyManagementExecutionResult,
  LegacyManagementTaskRefreshResult,
} from "@/lib/services/platform/legacy-management-contract";

export async function dryRunLegacyManagementTaskAction(
  taskId: string,
  organizationId: string,
): Promise<LegacyManagementDryRunResult> {
  return dryRunLegacyManagementTask(taskId, organizationId);
}

export async function executeLegacyManagementTaskAction(
  taskId: string,
  organizationId: string,
): Promise<LegacyManagementExecutionResult> {
  return executeLegacyManagementTask(taskId, organizationId);
}

export async function refreshLegacyManagementTasksAction(
  organizationId: string,
): Promise<LegacyManagementTaskRefreshResult[]> {
  return refreshLegacyManagementTasks(organizationId);
}
