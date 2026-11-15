"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type UsageBillTenant = {
  organizationId: string;
  organizationName: string;
  requests: number;
  estimatedCostUsd: number;
  canBill: boolean;
  billName?: string;
  billedAt?: string;
};

type UsageBillMonth = {
  month: string;
  monthName: string;
  unbilledCostUsd: number;
  billedCostUsd: number;
  unbilledTenants: UsageBillTenant[];
  billedTenants: UsageBillTenant[];
};

type UsageBillResponse = { months: UsageBillMonth[] };
type BillingTab = "unbilled" | "billed";

type UsageDailyCostRow = {
  date: string;
  requests: number;
  executionMs: string;
  egressBytes: string;
  dbStorageBytes: string;
  mediaStorageBytes: string;
  neonComputeCostUsd: number;
  dbStorageCostUsd: number;
  vercelInvocationCostUsd: number;
  egressCostUsd: number;
  mediaStorageCostUsd: number;
  estimatedCostUsd: number;
};

type UsageCostRates = {
  neonComputePerCuHour: number;
  databaseStoragePerGbMonth: number;
  vercelInvocationPerMillion: number;
  egressPerGb: number;
  mediaStoragePerGbMonth: number;
};

type UsageDailyBreakdownResponse = {
  month: string;
  organizationName: string;
  rows: UsageDailyCostRow[];
  isBilledSnapshot: boolean;
  rates: UsageCostRates;
  telemetry: {
    egressCaptured: boolean;
    mediaStorageConnected: boolean;
  };
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const numberFormat = new Intl.NumberFormat("en-IN");

function formatBytes(bytes: string) {
  const value = Number(bytes);
  return Number.isFinite(value) && value > 0
    ? `${(value / 1_048_576).toFixed(2)} MB`
    : "0 MB";
}

function formatBilledAt(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function DailyCostBreakdown({
  breakdown,
}: {
  breakdown: UsageDailyBreakdownResponse;
}) {
  const [year, monthNumber] = breakdown.month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const { rates, telemetry } = breakdown;

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
      <div>
        <h3 className="text-sm font-semibold">Day-wise cost calculation</h3>
        <p className="mt-1 text-xs text-[var(--erp-muted)]">
          {breakdown.organizationName} · {new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${breakdown.month}-01T00:00:00.000Z`))}
          {breakdown.isBilledSnapshot
            ? " · billed snapshot"
            : " · current daily aggregates"}
        </p>
        {!breakdown.isBilledSnapshot ? (
          <p className="mt-1 text-xs text-[var(--erp-muted)]">
            This bill predates daily snapshots or is still unbilled; the rows below show the currently stored daily calculations.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <p>
          <span className="font-semibold">Neon compute:</span>{" "}
          execution time ÷ 3,600,000 × {currency.format(rates.neonComputePerCuHour)} per hour
          (time-based proxy, not provider CU data).
        </p>
        <p>
          <span className="font-semibold">Database storage:</span>{" "}
          DB bytes ÷ 1 GB × {currency.format(rates.databaseStoragePerGbMonth)} per month ÷ {daysInMonth} days.
        </p>
        <p>
          <span className="font-semibold">Vercel invocations:</span>{" "}
          requests ÷ 1,000,000 × {currency.format(rates.vercelInvocationPerMillion)}.
        </p>
        <p>
          <span className="font-semibold">Egress:</span>{" "}
          bytes ÷ 1 GB × {currency.format(rates.egressPerGb)}; {telemetry.egressCaptured ? "captured" : "not captured, excluded"}.
        </p>
        <p>
          <span className="font-semibold">Media storage:</span>{" "}
          bytes ÷ 1 GB × {currency.format(rates.mediaStoragePerGbMonth)} per month ÷ {daysInMonth} days;
          {" "}{telemetry.mediaStorageConnected ? "connected" : "not connected, excluded"}.
        </p>
      </div>

      {breakdown.rows.length === 0 ? (
        <p className="text-sm text-[var(--erp-muted)]">No daily usage rows exist for this month.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[70rem] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--erp-border)] text-[var(--erp-muted)]">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2 text-right">Requests</th>
                <th className="px-2 py-2 text-right">Execution</th>
                <th className="px-2 py-2 text-right">DB storage</th>
                <th className="px-2 py-2 text-right">Neon compute</th>
                <th className="px-2 py-2 text-right">DB storage cost</th>
                <th className="px-2 py-2 text-right">Vercel invocations</th>
                <th className="px-2 py-2 text-right">Egress data</th>
                <th className="px-2 py-2 text-right">Egress cost</th>
                <th className="px-2 py-2 text-right">Media data</th>
                <th className="px-2 py-2 text-right">Media cost</th>
                <th className="px-2 py-2 text-right">Daily total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--erp-border)]">
              {breakdown.rows.map((row) => (
                <tr key={row.date}>
                  <td className="px-2 py-2">{row.date}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{numberFormat.format(row.requests)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{numberFormat.format(Number(row.executionMs))} ms</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBytes(row.dbStorageBytes)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{currency.format(row.neonComputeCostUsd)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{currency.format(row.dbStorageCostUsd)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{currency.format(row.vercelInvocationCostUsd)}</td>
                  <td className="px-2 py-2 text-right">
                    {telemetry.egressCaptured ? formatBytes(row.egressBytes) : "Not captured"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {telemetry.egressCaptured ? currency.format(row.egressCostUsd) : "Not captured"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {telemetry.mediaStorageConnected ? formatBytes(row.mediaStorageBytes) : "Not connected"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {telemetry.mediaStorageConnected ? currency.format(row.mediaStorageCostUsd) : "Not connected"}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{currency.format(row.estimatedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceServerCostPage({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [tab, setTab] = useState<BillingTab>("unbilled");
  const [data, setData] = useState<UsageBillResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingMonth, setCreatingMonth] = useState<string | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<Record<string, UsageDailyBreakdownResponse>>({});
  const [loadingBreakdownKey, setLoadingBreakdownKey] = useState<string | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const breakdownControllerRef = useRef<AbortController | null>(null);

  const loadBills = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ workspaceId });
      const response = await fetch(`/api/workspace/usage/cost/bills?${params}`, {
        signal,
        cache: "no-store",
      });
      const result = await response.json() as UsageBillResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in result && result.error
          ? result.error
          : "Unable to load monthly usage bills.");
      }
      setData(result as UsageBillResponse);
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load monthly usage bills.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadBills(controller.signal);
    });
    return () => {
      controller.abort();
      breakdownControllerRef.current?.abort();
    };
  }, [loadBills]);

  const visibleMonths = useMemo(() => (data?.months ?? [])
    .map((month) => ({
      ...month,
      tenants: tab === "unbilled" ? month.unbilledTenants : month.billedTenants,
      total: tab === "unbilled" ? month.unbilledCostUsd : month.billedCostUsd,
    }))
    .filter((month) => month.tenants.length > 0), [data?.months, tab]);

  const unbilledCount = useMemo(
    () => (data?.months ?? []).reduce((count, month) => count + month.unbilledTenants.length, 0),
    [data?.months],
  );
  const billedCount = useMemo(
    () => (data?.months ?? []).reduce((count, month) => count + month.billedTenants.length, 0),
    [data?.months],
  );

  const createBills = useCallback(async (month: UsageBillMonth) => {
    setCreatingMonth(month.month);
    setActionError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/workspace/usage/cost/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, month: month.month }),
      });
      const result = await response.json() as { createdCount?: number; error?: string };
      if (!response.ok) {
        throw new Error(result.error || `Unable to create bills for ${month.monthName}.`);
      }
      const createdCount = result.createdCount ?? 0;
      setNotice(createdCount > 0
        ? `Created ${numberFormat.format(createdCount)} ${createdCount === 1 ? "bill" : "bills"} for ${month.monthName}.`
        : `There are no unbilled organizations for ${month.monthName}.`);
      await loadBills();
    } catch (billError) {
      setActionError(billError instanceof Error ? billError.message : "Unable to create monthly bills.");
    } finally {
      setCreatingMonth(null);
    }
  }, [loadBills, workspaceId]);

  const toggleDailyBreakdown = useCallback(async (
    month: UsageBillMonth,
    tenant: UsageBillTenant,
    retry = false,
  ) => {
    const key = `${month.month}:${tenant.organizationId}`;
    if (!retry && expandedBreakdown === key) {
      breakdownControllerRef.current?.abort();
      setExpandedBreakdown(null);
      setLoadingBreakdownKey(null);
      setBreakdownError(null);
      return;
    }

    setExpandedBreakdown(key);
    setBreakdownError(null);
    if (!retry && breakdowns[key]) return;

    breakdownControllerRef.current?.abort();
    const controller = new AbortController();
    breakdownControllerRef.current = controller;
    setLoadingBreakdownKey(key);
    try {
      const params = new URLSearchParams({
        workspaceId,
        organizationId: tenant.organizationId,
        month: month.month,
      });
      const response = await fetch(`/api/workspace/usage/cost/bills/breakdown?${params}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const result = await response.json() as UsageDailyBreakdownResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in result && result.error
          ? result.error
          : "Unable to load daily cost details.");
      }
      setBreakdowns((current) => ({ ...current, [key]: result as UsageDailyBreakdownResponse }));
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setBreakdownError(loadError instanceof Error ? loadError.message : "Unable to load daily cost details.");
      }
    } finally {
      if (breakdownControllerRef.current === controller) {
        breakdownControllerRef.current = null;
        setLoadingBreakdownKey(null);
      }
    }
  }, [breakdowns, expandedBreakdown, workspaceId]);

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div
          className="inline-flex w-fit items-center gap-1 rounded-lg bg-[var(--erp-surface-soft)] p-1"
          role="tablist"
          aria-label="Server cost bills"
        >
          <Button
            type="button"
            size="sm"
            variant={tab === "unbilled" ? "primary" : "secondary"}
            role="tab"
            id="server-cost-unbilled-tab"
            aria-selected={tab === "unbilled"}
            aria-controls="server-cost-bill-list"
            onClick={() => setTab("unbilled")}
            className="px-3 py-1.5"
          >
            Unbilled
            <span className="ml-1 tabular-nums">({numberFormat.format(unbilledCount)})</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "billed" ? "primary" : "secondary"}
            role="tab"
            id="server-cost-billed-tab"
            aria-selected={tab === "billed"}
            aria-controls="server-cost-bill-list"
            onClick={() => setTab("billed")}
            className="px-3 py-1.5"
          >
            Billed
            <span className="ml-1 tabular-nums">({numberFormat.format(billedCount)})</span>
          </Button>
        </div>

        {error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--erp-danger)] p-4 text-sm text-[var(--erp-danger)]" role="alert">
            <span>{error}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => void loadBills()}>
              Retry
            </Button>
          </div>
        ) : null}
        {actionError ? (
          <p className="rounded-lg border border-[var(--erp-danger)] p-4 text-sm text-[var(--erp-danger)]" role="alert">
            {actionError}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg border border-[var(--erp-brand-soft)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-brand)]" role="status">
            {notice}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-[var(--erp-muted)]" role="status">Loading monthly usage…</p> : null}
        {!loading && !error && visibleMonths.length === 0 ? (
          <Card className="py-10 text-center text-sm text-[var(--erp-muted)]">
            {tab === "unbilled"
              ? "There are no unbilled monthly usage records."
              : "No monthly bills have been created yet."}
          </Card>
        ) : null}

        <div
          id="server-cost-bill-list"
          role="tabpanel"
          aria-labelledby={tab === "unbilled" ? "server-cost-unbilled-tab" : "server-cost-billed-tab"}
          className="space-y-4"
        >
          {visibleMonths.map((month) => {
            const canCreateBill = tab === "unbilled"
              && month.tenants.every((tenant) => tenant.canBill);
            return (
              <Card key={month.month} className="space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{month.monthName}</h2>
                    <p className="mt-1 text-sm text-[var(--erp-muted)]">
                      {numberFormat.format(month.tenants.length)} {month.tenants.length === 1 ? "organization" : "organizations"}
                      <span className="mx-2" aria-hidden="true">·</span>
                      {currency.format(month.total)}
                    </p>
                  </div>
                  {tab === "unbilled" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={!canCreateBill || creatingMonth !== null}
                      onClick={() => void createBills(month)}
                    >
                      {creatingMonth === month.month ? "Creating bills…" : `Create bills for ${month.monthName}`}
                    </Button>
                  ) : null}
                </header>

                {tab === "unbilled" && !canCreateBill ? (
                  <p className="text-sm text-[var(--erp-muted)]">
                    Organization settings access is required for every organization in this monthly bill.
                  </p>
                ) : null}

                <div className="divide-y divide-[var(--erp-border)]">
                  {month.tenants.map((tenant) => (
                    <div key={tenant.organizationId} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tenant.organizationName}</p>
                          {tab === "billed" ? (
                            <p className="mt-1 text-xs text-[var(--erp-muted)]">
                              {tenant.billName}
                              {tenant.billedAt ? ` · Billed ${formatBilledAt(tenant.billedAt)}` : ""}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-[var(--erp-muted)]">
                              {numberFormat.format(tenant.requests)} requests
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <p className="text-sm font-semibold tabular-nums">
                            {currency.format(tenant.estimatedCostUsd)}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            aria-expanded={expandedBreakdown === `${month.month}:${tenant.organizationId}`}
                            onClick={() => void toggleDailyBreakdown(month, tenant)}
                          >
                            {expandedBreakdown === `${month.month}:${tenant.organizationId}`
                              ? "Hide daily breakdown"
                              : "Day-wise breakdown"}
                          </Button>
                        </div>
                      </div>
                      {expandedBreakdown === `${month.month}:${tenant.organizationId}` ? (
                        <div className="mt-3">
                          {loadingBreakdownKey === expandedBreakdown ? (
                            <p className="text-sm text-[var(--erp-muted)]" role="status">
                              Loading daily cost calculations…
                            </p>
                          ) : null}
                          {breakdownError ? (
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--erp-danger)] p-3 text-sm text-[var(--erp-danger)]" role="alert">
                              <span>{breakdownError}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => void toggleDailyBreakdown(month, tenant, true)}
                              >
                                Retry
                              </Button>
                            </div>
                          ) : null}
                          {breakdowns[expandedBreakdown] ? (
                            <DailyCostBreakdown breakdown={breakdowns[expandedBreakdown]} />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-[var(--erp-muted)]">
          Usage bills are internal cost snapshots, not tax invoices. Costs are estimates; response egress and media storage are not connected.
        </p>
      </Section>
    </Page>
  );
}
