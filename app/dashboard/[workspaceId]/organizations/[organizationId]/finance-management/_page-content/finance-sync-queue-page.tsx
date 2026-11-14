"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";

type SyncLog = {
  id: string;
  transactionId: string;
  provider: string;
  status: string;
  eventType: string;
  attemptCount: number;
  availableAt: string;
  processedAt: string | null;
  createdAt: string;
  error: { code: string; message: string } | null;
  transaction: {
    documentType: string;
    documentNumber: string;
    sourceModule: string;
    sourceType: string;
    sourceDocumentNumber: string;
    totalAmount: string;
  };
};

type QueueResponse = {
  logs: SyncLog[];
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
};

function currency(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  const symbol = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).formatToParts(0).find((part) => part.type === "currency")?.value ?? "INR";
  return `${symbol}${new Intl.NumberFormat("en-IN").format(BigInt(whole))}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export default function FinanceSyncQueuePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [count, setCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endpoint = useMemo(
    () => `/api/organizations/${encodeURIComponent(organizationId)}/finance/sync-queue`,
    [organizationId],
  );
  const financeHome = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management`;
  const transactionHref = useCallback((transactionId: string) =>
    `${financeHome}/transactions/${encodeURIComponent(transactionId)}`, [financeHome]);

  const load = useCallback(async (cursor?: string | null, append = false) => {
    const params = new URLSearchParams({ limit: "50" });
    if (status) params.set("status", status);
    if (provider) params.set("provider", provider);
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as QueueResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load the finance sync queue.");
      setLogs((current) => append ? [...current, ...result.logs] : result.logs);
      setCount(result.count);
      setNextCursor(result.nextCursor);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the finance sync queue.");
    } finally {
      if (!append) setLoading(false);
    }
  }, [endpoint, provider, status]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50" });
    if (status) params.set("status", status);
    if (provider) params.set("provider", provider);
    fetch(`${endpoint}?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as QueueResponse & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load the finance sync queue.");
        setLogs(result.logs);
        setCount(result.count);
        setNextCursor(result.nextCursor);
        setError(null);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load the finance sync queue.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, provider, status]);

  async function dispatch(action: "sync-now" | "retry-failed") {
    setDispatching(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${endpoint}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, limit: 50 }),
      });
      const result = await response.json() as {
        processed?: number;
        synced?: number;
        failed?: number;
        skipped?: number;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Unable to dispatch finance synchronization.");
      setNotice(result.message ?? `${result.synced ?? 0} synced, ${result.failed ?? 0} failed, ${result.skipped ?? 0} skipped.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to dispatch finance synchronization.");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance Management</p>
            <h1 className="mt-1 text-2xl font-semibold">Accounting sync queue</h1>
            <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Review provider dispatch attempts and retry eligible documents.</p>
          </div>
          <Link href={financeHome}><Button variant="outline">Back to Finance</Button></Link>
        </header>

        {error && <p role="alert" className="text-sm font-medium text-[var(--erp-danger)]">{error}</p>}
        {notice && <p role="status" className="text-sm font-medium text-[var(--erp-success)]">{notice}</p>}

        <Card className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Status"
              value={status}
              onChange={(event) => {
                setLoading(true);
                setStatus(event.target.value);
              }}
              options={[
                { value: "", label: "All statuses" },
                { value: "PENDING", label: "Pending" },
                { value: "QUEUED", label: "Queued" },
                { value: "SYNCED", label: "Synced" },
                { value: "FAILED", label: "Failed" },
                { value: "SKIPPED", label: "Skipped" },
              ]}
            />
            <Select
              label="Provider"
              value={provider}
              onChange={(event) => {
                setLoading(true);
                setProvider(event.target.value);
              }}
              options={[
                { value: "", label: "All providers" },
                { value: "TALLY", label: "Tally Prime" },
                { value: "ZOHO_BOOKS", label: "Zoho Books" },
                { value: "NONE", label: "Not assigned" },
              ]}
            />
            <div className="flex flex-wrap items-end gap-3">
              <Button onClick={() => void dispatch("sync-now")} disabled={dispatching}>
                {dispatching ? "Processing…" : "Sync Now"}
              </Button>
              <Button variant="outline" onClick={() => void dispatch("retry-failed")} disabled={dispatching}>
                Retry Failed
              </Button>
            </div>
          </div>
          <p className="text-sm text-[var(--erp-text-muted)]">{count} queue record{count === 1 ? "" : "s"}</p>
        </Card>

        <Card>
          {loading ? (
            <p role="status" className="text-sm text-[var(--erp-text-muted)]">Loading synchronization records…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-[var(--erp-text-muted)]">No synchronization records match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col">Source</th>
                    <th scope="col">Provider</th>
                    <th scope="col">Status</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Last update</th>
                    <th scope="col">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <Link className="font-medium text-[var(--erp-brand)] underline" href={transactionHref(log.transactionId)}>
                          {log.transaction.documentNumber}
                        </Link>
                        <p className="text-xs text-[var(--erp-text-muted)]">{log.transaction.documentType.replaceAll("_", " ")}</p>
                      </td>
                      <td>
                        <p>{log.transaction.sourceModule.replaceAll("_", " ")}</p>
                        <p className="text-xs text-[var(--erp-text-muted)]">{log.transaction.sourceDocumentNumber}</p>
                      </td>
                      <td>{log.provider.replaceAll("_", " ")}</td>
                      <td><Badge>{log.status}</Badge></td>
                      <td>{log.attemptCount}</td>
                      <td>{currency(log.transaction.totalAmount)}</td>
                      <td>{new Date(log.processedAt ?? log.createdAt).toLocaleString("en-IN")}</td>
                      <td>{log.error?.message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {nextCursor && !loading && (
            <div className="mt-4">
              <Button variant="outline" onClick={() => void load(nextCursor, true)}>Load more</Button>
            </div>
          )}
        </Card>
      </Section>
    </Page>
  );
}
