"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";

export default function FinanceTransactionSyncActions({
  organizationId,
  transactionId,
}: {
  organizationId: string;
  transactionId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/finance/sync-queue/dispatch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry-transaction", transactionId, limit: 1 }),
        },
      );
      const result = await response.json() as { synced?: number; failed?: number; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to retry provider synchronization.");
      setMessage(result.message ?? `${result.synced ?? 0} synchronized; ${result.failed ?? 0} failed.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to retry provider synchronization.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={() => void retry()} disabled={busy}>
        {busy ? "Retrying…" : "Retry synchronization"}
      </Button>
      {message && <p role="status" className="text-sm text-[var(--erp-success)]">{message}</p>}
      {error && <p role="alert" className="text-sm text-[var(--erp-danger)]">{error}</p>}
    </div>
  );
}
