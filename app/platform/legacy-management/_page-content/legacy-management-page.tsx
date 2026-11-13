"use client";

import { useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import type {
  LegacyManagementOrganization,
  LegacyManagementStatus,
  LegacyManagementTaskId,
} from "@/lib/services/platform/legacy-management-contract";
import {
  dryRunLegacyManagementTaskAction,
  executeLegacyManagementTaskAction,
  refreshLegacyManagementTasksAction,
} from "../actions";
import {
  applyDryRunResult,
  applyExecutionFailure,
  applyExecutionResult,
  applyTaskRefreshResult,
  createInitialLegacyManagementTasks,
  type LegacyManagementTaskRow,
} from "./legacy-management-state";

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "dry-run-passed", label: "Dry Run Passed" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
] as const;

const REPORT_FIELDS = [
  { key: "name", label: "TASK NAME" },
  { key: "targetModule", label: "TARGET MODULE" },
  { key: "totalRecords", label: "TOTAL RECORDS" },
  { key: "executed", label: "EXECUTED" },
  { key: "balance", label: "BALANCE" },
  { key: "skippedCount", label: "SKIPPED" },
  { key: "status", label: "STATUS" },
];

const INITIAL_VISIBLE_FIELDS = REPORT_FIELDS.map(({ key }) => key);

const STATUS_LABELS: Record<LegacyManagementStatus, string> = {
  PENDING: "PENDING",
  DRY_RUN_PASSED: "DRY RUN PASSED",
  COMPLETED: "COMPLETED",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
};

const STATUS_BADGE_CLASSES: Record<LegacyManagementStatus, string> = {
  PENDING: "border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-[var(--erp-muted)]",
  DRY_RUN_PASSED: "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]",
  COMPLETED: "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]",
  PARTIAL: "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]",
  FAILED: "border-[var(--erp-danger)] bg-[var(--erp-surface)] text-[var(--erp-danger)]",
};

function formatCount(value: number | null) {
  return value === null ? "-" : value.toLocaleString("en-IN");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The legacy task could not be completed.";
}

type LegacyManagementPageProps = {
  organizations: LegacyManagementOrganization[];
};

export default function LegacyManagementPage({
  organizations,
}: LegacyManagementPageProps) {
  const [tasks, setTasks] = useState(createInitialLegacyManagementTasks);
  const [visibleFields, setVisibleFields] = useState<string[]>(INITIAL_VISIBLE_FIELDS);
  const [activeFilter, setActiveFilter] = useState<(typeof FILTER_TABS)[number]["value"]>("all");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [pendingExecutionTaskId, setPendingExecutionTaskId] = useState<LegacyManagementTaskId | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runningAction, setRunningAction] = useState<{
    taskId: LegacyManagementTaskId;
    action: "dry-run" | "execute";
  } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const operationVersion = useRef(0);
  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  );

  const filteredTasks = useMemo(
    () => tasks.filter((task) => {
      if (activeFilter === "pending") return task.status === "PENDING";
      if (activeFilter === "dry-run-passed") return task.status === "DRY_RUN_PASSED";
      if (activeFilter === "completed") return task.status === "COMPLETED";
      if (activeFilter === "failed") return task.status === "FAILED";
      return true;
    }),
    [activeFilter, tasks],
  );

  function changeOrganization(organizationId: string) {
    operationVersion.current += 1;
    setSelectedOrganizationId(organizationId);
    setPendingExecutionTaskId(null);
    setNotice(null);
    setTasks(createInitialLegacyManagementTasks());
  }

  async function refreshTaskMetrics() {
    if (
      !selectedOrganizationId ||
      runningAction ||
      pendingExecutionTaskId ||
      isRefreshing
    ) return;

    const currentOperationVersion = operationVersion.current;
    setNotice(null);
    setIsRefreshing(true);
    try {
      const refreshedTasks = await refreshLegacyManagementTasksAction(selectedOrganizationId);
      if (operationVersion.current !== currentOperationVersion) return;

      setTasks((currentTasks) => currentTasks.map((task) => {
        const refreshedTask = refreshedTasks.find((result) => result.taskId === task.id);
        return refreshedTask ? applyTaskRefreshResult(task, refreshedTask) : task;
      }));
      const eligibleCount = refreshedTasks.reduce((count, task) => count + task.totalEligible, 0);
      const skippedCount = refreshedTasks.reduce((count, task) => count + task.skippedCount, 0);
      const firstSkip = refreshedTasks.find((task) => task.sampleSkips?.length)?.sampleSkips?.[0];
      setNotice({
        type: "success",
        message: `Task metrics refreshed for ${selectedOrganization?.name}: ${eligibleCount.toLocaleString("en-IN")} eligible, ${skippedCount.toLocaleString("en-IN")} skipped.${firstSkip ? ` First skip: ${firstSkip.reason}` : ""}`,
      });
    } catch (error) {
      if (operationVersion.current !== currentOperationVersion) return;
      setNotice({ type: "error", message: getErrorMessage(error) });
    } finally {
      if (operationVersion.current === currentOperationVersion) setIsRefreshing(false);
    }
  }

  async function runDryRun(taskId: LegacyManagementTaskId) {
    if (!selectedOrganizationId || runningAction || isRefreshing) return;

    const currentOperationVersion = operationVersion.current;
    setNotice(null);
    setRunningAction({ taskId, action: "dry-run" });
    try {
      const result = await dryRunLegacyManagementTaskAction(taskId, selectedOrganizationId);
      if (operationVersion.current !== currentOperationVersion) return;

      setTasks((currentTasks) => currentTasks.map((task) =>
        task.id === taskId ? applyDryRunResult(task, result) : task,
      ));
      setNotice({
        type: "success",
        message: `Dry run complete: ${result.totalEligible.toLocaleString("en-IN")} eligible, ${result.previouslyProcessed.toLocaleString("en-IN")} already processed, ${result.skippedCount.toLocaleString("en-IN")} skipped.${result.sampleSkips?.[0] ? ` First skip: ${result.sampleSkips[0].reason}` : ""}`,
      });
    } catch (error) {
      if (operationVersion.current !== currentOperationVersion) return;
      const failureReason = getErrorMessage(error);
      setTasks((currentTasks) => currentTasks.map((task) =>
        task.id === taskId ? { ...task, status: "FAILED", failureReason } : task,
      ));
      setNotice({ type: "error", message: failureReason });
    } finally {
      if (operationVersion.current === currentOperationVersion) setRunningAction(null);
    }
  }

  async function executeTask(taskId: LegacyManagementTaskId) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (
      !selectedOrganization ||
      !task ||
      task.status !== "DRY_RUN_PASSED" ||
      runningAction ||
      isRefreshing ||
      pendingExecutionTaskId !== taskId
    ) return;

    const currentOperationVersion = operationVersion.current;
    setNotice(null);
    setPendingExecutionTaskId(null);
    setRunningAction({ taskId, action: "execute" });
    try {
      const result = await executeLegacyManagementTaskAction(taskId, selectedOrganization.id);
      if (operationVersion.current !== currentOperationVersion) return;

      setTasks((currentTasks) => currentTasks.map((currentTask) =>
        currentTask.id === taskId ? applyExecutionResult(currentTask, result) : currentTask,
      ));
      setNotice({
        type: result.status === "FAILED" ? "error" : "success",
        message: `Execution ${result.status.toLowerCase()}: ${result.processedCount.toLocaleString("en-IN")} processed, ${result.skippedCount.toLocaleString("en-IN")} skipped.${result.sampleSkips?.[0] ? ` First skip: ${result.sampleSkips[0].reason}` : ""}`,
      });
    } catch (error) {
      if (operationVersion.current !== currentOperationVersion) return;
      const failureReason = getErrorMessage(error);
      setTasks((currentTasks) => currentTasks.map((currentTask) =>
        currentTask.id === taskId ? applyExecutionFailure(currentTask, failureReason) : currentTask,
      ));
      setNotice({ type: "error", message: failureReason });
    } finally {
      if (operationVersion.current === currentOperationVersion) setRunningAction(null);
    }
  }

  return (
    <Page className="max-w-none">
      <Section className="space-y-4">
        <header>
          <p className="erp-eyebrow">PLATFORM</p>
          <h1 className="text-2xl font-bold text-[var(--erp-text)]">Legacy Management</h1>
          <p className="text-sm text-[var(--erp-muted)]">
            Tenant-scoped legacy data backfills, dry-run validation, and controlled batch execution.
          </p>
          <p className="text-xs text-[var(--erp-muted)]">
            Dry Run is read-only: it checks eligible records and proposed changes, not write constraints or audit-log availability.
          </p>
        </header>

        {notice ? (
          <p
            className={notice.type === "error" ? "text-sm text-[var(--erp-danger)]" : "text-sm text-[var(--erp-brand)]"}
            role={notice.type === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {notice.message}
          </p>
        ) : null}

        <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Tabs
              compact
              value={activeFilter}
              onChange={setActiveFilter}
              ariaLabel="Filter legacy management tasks"
              tabs={FILTER_TABS.map((tab) => ({
                ...tab,
                panelId: "legacy-management-report",
              }))}
            />
          </div>
          <div className="flex w-full items-end gap-3 sm:w-auto">
            <div className="min-w-0 flex-1 sm:min-w-72">
              <Select
                label="Target Organization"
                value={selectedOrganizationId}
                onChange={(event) => changeOrganization(event.currentTarget.value)}
                disabled={Boolean(runningAction) || Boolean(pendingExecutionTaskId) || isRefreshing}
                hint="Select an organization before refreshing task metrics or running actions."
                className="sm:min-w-72"
              >
                <option value="">Select an organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </Select>
            </div>
            <span title={selectedOrganizationId ? undefined : "Select an organization first."}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !selectedOrganizationId ||
                  Boolean(runningAction) ||
                  Boolean(pendingExecutionTaskId) ||
                  isRefreshing
                }
                onClick={() => void refreshTaskMetrics()}
                aria-label="Refresh task metrics"
              >
                {isRefreshing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Refresh
              </Button>
            </span>
          </div>
        </div>

        <div id="legacy-management-report" role="tabpanel">
          <Card className="border-[var(--erp-border)] p-3 shadow-none">
            <ReportGrid
              title="Legacy management tasks"
              records={filteredTasks}
              fields={REPORT_FIELDS}
              visibleFields={visibleFields}
              onVisibleFieldsChange={setVisibleFields}
              storageKey="platform-legacy-management-report-columns-v1"
              rowIdSelector={(task) => task.id}
              selectedIds={[]}
              selectable={false}
              rowActions={(task: LegacyManagementTaskRow) => {
                const isRunningDryRun = runningAction?.taskId === task.id && runningAction.action === "dry-run";
                const isRunningExecution = runningAction?.taskId === task.id && runningAction.action === "execute";
                const isConfirmingExecution = pendingExecutionTaskId === task.id;
                const noOrganizationSelected = !selectedOrganizationId;
                const canExecute = task.status === "DRY_RUN_PASSED" && (task.balance ?? 0) > 0;
                const disableActions = noOrganizationSelected ||
                  Boolean(runningAction) ||
                  isRefreshing ||
                  (Boolean(pendingExecutionTaskId) && !isConfirmingExecution);
                const disabledHint = noOrganizationSelected
                  ? "Select an organization first."
                  : undefined;

                return (
                  <>
                    <span title={disabledHint}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={disableActions || Boolean(pendingExecutionTaskId) || task.status === "COMPLETED"}
                        onClick={() => void runDryRun(task.id)}
                        aria-label={`Dry Run: ${task.name}`}
                        className="text-[10px]"
                      >
                        {isRunningDryRun ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : null}
                        {isRunningDryRun ? "Running..." : "Dry Run"}
                      </Button>
                    </span>
                    {isConfirmingExecution ? (
                      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
                        <span className="text-xs text-[var(--erp-text)]">
                          Run legacy update for {selectedOrganization?.name}?
                        </span>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={Boolean(runningAction)}
                          onClick={() => void executeTask(task.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(runningAction)}
                          onClick={() => setPendingExecutionTaskId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span title={disabledHint}>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={disableActions || !canExecute}
                          onClick={() => setPendingExecutionTaskId(task.id)}
                          aria-label={`Execute: ${task.name}`}
                          className="text-[10px]"
                        >
                          {isRunningExecution ? (
                            <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : null}
                          {isRunningExecution ? "Executing..." : "Execute"}
                        </Button>
                      </span>
                    )}
                  </>
                );
              }}
              emptyMessage="No legacy tasks match this status filter."
              renderCell={(fieldKey, task) => {
                if (fieldKey === "name") {
                  return <span className="font-semibold text-[var(--erp-brand)]">{task.name}</span>;
                }
                if (fieldKey === "targetModule") return task.targetModule;
                if (fieldKey === "totalRecords") return formatCount(task.totalRecords);
                if (fieldKey === "executed") return formatCount(task.executed);
                if (fieldKey === "balance") return formatCount(task.balance);
                if (fieldKey === "skippedCount") return formatCount(task.skippedCount);
                if (fieldKey === "status") {
                  return (
                    <div className="space-y-1">
                      <Badge className={STATUS_BADGE_CLASSES[task.status]}>
                        {STATUS_LABELS[task.status]}
                      </Badge>
                      {task.status === "FAILED" && task.failureReason ? (
                        <p className="max-w-72 whitespace-normal text-xs text-[var(--erp-danger)]">
                          {task.failureReason}
                        </p>
                      ) : null}
                    </div>
                  );
                }
                return "";
              }}
            />
          </Card>
        </div>
      </Section>
    </Page>
  );
}
