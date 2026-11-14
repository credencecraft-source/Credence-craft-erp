"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Table from "@/components/ui/Table";

type SyncLog = {
  id: string;
  transactionId: string;
  status: string;
  attemptCount: number;
  createdAt: string;
  processedAt: string | null;
  error: { code: string; message: string } | null;
  transaction: {
    documentType: string;
    documentNumber: string;
    sourceDocumentNumber: string;
    totalAmount: string;
  };
};

type QueueResponse = {
  logs: SyncLog[];
  count: number;
};

export default function FinanceZohoSyncPanel({
  workspaceId,
  organizationId,
  enabled,
}: {
  workspaceId: string;
  organizationId: string;
  enabled: boolean;
}) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endpoint = useMemo(
    () => `/api/organizations/${encodeURIComponent(organizationId)}/finance/sync-queue`,
    [organizationId],
  );
  const financeHome = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management`;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({ limit: "5", provider: "ZOHO_BOOKS" });
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json() as QueueResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load Zoho Books sync activity.");
      setLogs(result.logs);
      setCount(result.count);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unable to load Zoho Books sync activity.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "5", provider: "ZOHO_BOOKS" });
    fetch(`${endpoint}?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as QueueResponse & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load Zoho Books sync activity.");
        return result;
      })
      .then((result) => {
        setLogs(result.logs);
        setCount(result.count);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load Zoho Books sync activity.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint]);

  async function dispatch(action: "sync-now" | "retry-failed") {
    setDispatching(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${endpoint}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, limit: 20 }),
      });
      const result = await response.json() as {
        synced?: number;
        failed?: number;
        skipped?: number;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Unable to synchronize Zoho Books transactions.");
      setNotice(result.message ?? `${result.synced ?? 0} synced, ${result.failed ?? 0} failed, ${result.skipped ?? 0} skipped.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to synchronize Zoho Books transactions.");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Zoho Books synchronization</h2>
          <p className="mt-1 text-sm text-[var(--erp-text-muted)]">
            Review recent outbox attempts and manually send pending transactions.
          </p>
        </div>
        <Badge>{enabled ? "Zoho Books active" : "Zoho Books inactive"}</Badge>
      </div>

      {error && <p role="alert" className="text-sm font-medium text-[var(--erp-danger)]">{error}</p>}
      {notice && <p role="status" className="text-sm font-medium text-[var(--erp-success)]">{notice}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void dispatch("sync-now")} disabled={!enabled || dispatching}>
          {dispatching ? "Processing…" : "Sync Pending Transactions"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void dispatch("retry-failed")}
          disabled={!enabled || dispatching}
        >
          Retry Failed
        </Button>
        <span className="text-sm text-[var(--erp-text-muted)]">
          {count} Zoho Books outbox record{count === 1 ? "" : "s"}
        </span>
      </div>
      {!enabled && (
        <p className="text-sm text-[var(--erp-text-muted)]">
          Select Zoho Books as the active provider and save the configuration to enable dispatch.
        </p>
      )}

      {loading ? (
        <p role="status" className="text-sm text-[var(--erp-text-muted)]">Loading recent sync activity…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-[var(--erp-text-muted)]">No Zoho Books outbox activity is available.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Source document</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Last update</th>
                <th scope="col">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <Link
                      className="font-medium text-[var(--erp-brand)] underline"
                      href={`${financeHome}/transactions/${encodeURIComponent(log.transactionId)}`}
                    >
                      {log.transaction.documentNumber}
                    </Link>
                    <p className="text-xs text-[var(--erp-text-muted)]">
                      {log.transaction.documentType.replaceAll("_", " ")}
                    </p>
                  </td>
                  <td>{log.transaction.sourceDocumentNumber}</td>
                  <td><Badge>{log.status}</Badge></td>
                  <td>{log.attemptCount}</td>
                  <td>{new Date(log.processedAt ?? log.createdAt).toLocaleString("en-IN")}</td>
                  <td>{log.error?.message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <Link
        href={`${financeHome}/sync-queue`}
        className="inline-flex text-sm font-medium text-[var(--erp-brand)] underline"
      >
        Open full sync queue
      </Link>
    </Card>
  );
}
