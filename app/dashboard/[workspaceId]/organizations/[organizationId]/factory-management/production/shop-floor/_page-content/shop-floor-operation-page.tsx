"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import {
  consolidateShopFloorProcesses,
  type ShopFloorProcessBoard,
  type ShopFloorProcessBoardRow,
  type ShopFloorQueueItem,
} from "@/lib/services/factory/shop-floor-board";

type OperationAction = "assign" | "scan" | "complete" | "transfer" | "accept-transfer";

function normalizeProcessName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchProcessBoard(organizationId: string, workOrderId: string) {
  const query = new URLSearchParams({ organizationId, workOrderId });
  const response = await fetch(`/api/factory/production/shop-floor?${query}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load this shop-floor operation.");
  return consolidateShopFloorProcesses((data.processes ?? []) as ShopFloorProcessBoardRow[]);
}

export default function ShopFloorOperationPage({
  workspaceId,
  organizationId,
  processSlug,
  workOrderId,
  recordId,
  recordType,
}: {
  workspaceId: string;
  organizationId: string;
  processSlug: string;
  workOrderId: string;
  recordId: string;
  recordType: "operation" | "transfer";
}) {
  const router = useRouter();
  const [processes, setProcesses] = useState<ShopFloorProcessBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOperation = useCallback(async () => {
    setError("");
    try {
      setProcesses(await fetchProcessBoard(organizationId, workOrderId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this shop-floor operation.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, workOrderId]);

  useEffect(() => {
    let active = true;
    void fetchProcessBoard(organizationId, workOrderId)
      .then((result) => {
        if (active) setProcesses(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load this shop-floor operation.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [organizationId, workOrderId]);

  const process = processes.find((item) =>
    normalizeProcessName(item.processName) === normalizeProcessName(processSlug),
  );
  const operation = recordType === "operation"
    ? process?.queue.find((item) => item.id === recordId)
    : null;
  const transfer = recordType === "transfer"
    ? process?.incomingTransfers.find((item) => item.id === recordId)
    : null;

  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor`;
  const processPath = `${basePath}/${encodeURIComponent(processSlug)}`;

  async function runAction(action: OperationAction, payload: Record<string, string | number>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/factory/production/shop-floor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The shop-floor action could not be completed.");

      if (action === "accept-transfer") {
        router.push(processPath);
        return;
      }

      setNotice("Operation updated.");
      await loadOperation();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The shop-floor action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function assignBatch(item: ShopFloorQueueItem) {
    const value = window.prompt(
      `Assign quantity for ${item.processName} (${item.workOrderNo}). Enter a number:`,
      String(item.quantity),
    );
    if (value === null) return;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > item.quantity) {
      setError("Enter a positive whole quantity no greater than the unassigned amount.");
      return;
    }
    const laborerName = window.prompt("Enter the laborer name (optional):", "Floor Crew");
    if (laborerName === null) return;
    void runAction("assign", {
      workOrderId: item.workOrderId,
      processId: item.processId,
      quantity,
      laborerName,
    });
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Button type="button" variant="ghost" onClick={() => router.push(processPath)}>
              &larr; Back to {process?.processName ?? "process"} board
            </Button>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Factory Management · Shop Floor · Operation
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              {operation?.workOrderNo ?? transfer?.workOrderNo ?? "Shop-floor operation"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{process?.processName ?? processSlug.replace(/-/g, " ")}</p>
          </div>
          {(operation || transfer) && (
            <Card className="border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quantity</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {(operation?.quantity ?? transfer?.quantity ?? 0).toLocaleString("en-IN")} pcs
              </p>
            </Card>
          )}
        </header>

        {loading && <Card className="border-slate-200 p-6 text-sm text-slate-600">Loading operation...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</Card>}
        {notice && <Card className="erp-alert erp-alert-success p-4 text-sm" role="status">{notice}</Card>}

        {!loading && !error && recordType === "operation" && operation && (
          <Card className="space-y-4 border-slate-200 bg-white p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current stage</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{operation.status.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {operation.laborerName ?? operation.contractorName ?? "General pool"}
                </p>
              </div>
              {operation.scannedBy && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last handled by</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{operation.scannedBy}</p>
                </div>
              )}
              {operation.receivedAt && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {new Date(operation.receivedAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
              {operation.status === "UNASSIGNED" && (
                <Button type="button" disabled={busy} onClick={() => assignBatch(operation)}>
                  {busy ? "Working..." : "Assign batch"}
                </Button>
              )}
              {operation.status === "ASSIGNED" && (
                <Button type="button" disabled={busy} onClick={() => void runAction("scan", { logId: operation.id })}>
                  {busy ? "Working..." : "Start work"}
                </Button>
              )}
              {operation.status === "IN_PROGRESS" && (
                <Button type="button" disabled={busy} onClick={() => void runAction("complete", { logId: operation.id })}>
                  {busy ? "Working..." : "Complete work"}
                </Button>
              )}
              {operation.status === "COMPLETED" && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void runAction("transfer", {
                  workOrderId: operation.workOrderId,
                  logId: operation.id,
                })}>
                  {busy ? "Working..." : "Transfer output"}
                </Button>
              )}
              {operation.status === "TRANSFERRED" && (
                <p className="text-sm font-medium text-slate-600">This quantity has already left this process.</p>
              )}
            </div>
          </Card>
        )}

        {!loading && !error && recordType === "transfer" && transfer && (
          <Card className="space-y-4 border-slate-200 bg-white p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming from</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{transfer.fromProcessName}</p>
              <p className="mt-1 text-xs text-slate-500">
                Sent {new Date(transfer.sentAt).toLocaleString()}
              </p>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void runAction("accept-transfer", { transferId: transfer.id })}
              >
                {busy ? "Receiving..." : "Accept receipt"}
              </Button>
            </div>
          </Card>
        )}

        {!loading && !error && !operation && !transfer && (
          <Card className="border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">This operation is no longer available.</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => router.push(processPath)}>
              Return to process board
            </Button>
          </Card>
        )}
      </Section>
    </Page>
  );
}
