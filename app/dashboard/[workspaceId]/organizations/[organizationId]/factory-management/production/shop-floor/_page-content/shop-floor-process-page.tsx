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
  type ShopFloorStatusKey,
} from "@/lib/services/factory/shop-floor-board";

const STATUS_ORDER: ShopFloorStatusKey[] = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "TRANSFERRED"];

function normalizeProcessName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchProcesses(organizationId: string) {
  const response = await fetch(`/api/factory/production/shop-floor?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load this process.");
  return consolidateShopFloorProcesses((data.processes ?? []) as ShopFloorProcessBoardRow[]);
}

export default function ShopFloorProcessPage({
  workspaceId,
  organizationId,
  processSlug,
}: {
  workspaceId: string;
  organizationId: string;
  processSlug: string;
}) {
  const router = useRouter();
  const [processes, setProcesses] = useState<ShopFloorProcessBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProcesses = useCallback(async () => {
    setError("");
    try {
      setProcesses(await fetchProcesses(organizationId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this process.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    void fetchProcesses(organizationId)
      .then((result) => {
        if (active) setProcesses(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load this process.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [organizationId]);

  const process = processes.find((item) => normalizeProcessName(item.processName) === normalizeProcessName(processSlug));

  async function executeAction(action: string, payload: Record<string, string | number | undefined>) {
    const response = await fetch("/api/factory/production/shop-floor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, action, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The shop-floor action could not be completed.");
    await loadProcesses();
  }

  const handleAssign = async (item: ShopFloorQueueItem) => {
    const value = window.prompt(`Assign quantity for ${item.processName} (${item.workOrderNo}). Enter a number:`, String(item.quantity));
    const quantity = Number(value ?? "");
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > item.quantity) return;
    const laborerName = window.prompt("Enter the laborer name (optional):", "Floor Crew") ?? "Floor Crew";
    try {
      await executeAction("assign", {
        workOrderId: item.workOrderId,
        processId: item.processId,
        quantity,
        laborerName,
      });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to assign the batch.");
    }
  };

  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Button type="button" variant="ghost" onClick={() => router.push(basePath)}>
              &larr; All processes
            </Button>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Factory Management · Shop Floor</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{process?.processName ?? "Process"}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">View work orders and manage quantities by status for this process.</p>
          </div>
          {process && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Work orders</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{process.workOrderCount}</p>
            </div>
          )}
        </div>

        {loading && <Card className="border-slate-200 p-6 text-sm text-slate-600">Loading process status...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>}
        {!loading && !error && !process && (
          <Card className="border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">This process was not found.</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => router.push(basePath)}>Return to processes</Button>
          </Card>
        )}

        {!loading && !error && process && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {STATUS_ORDER.map((status) => (
                <Card key={status} className="border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {status === "UNASSIGNED" ? "Unassigned pool" : status.replace(/_/g, " ")}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{process.statusCounts[status].toLocaleString("en-IN")}</p>
                  <p className="mt-1 text-xs text-slate-500">pieces</p>
                </Card>
              ))}
            </div>

            {process.incomingTransfers.length > 0 && (
              <Card className="space-y-3 border-slate-200 bg-white p-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Incoming transfers</h2>
                  <p className="mt-1 text-sm text-slate-600">Accept receipt to place the quantity into this process pool.</p>
                </div>
                {process.incomingTransfers.map((transfer) => (
                  <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{transfer.workOrderNo} · {transfer.quantity} pcs</p>
                      <p className="mt-1 text-xs text-slate-500">From {transfer.fromProcessName}</p>
                    </div>
                    <Button type="button" size="lg" variant="primary" onClick={() => void executeAction("accept-transfer", { transferId: transfer.id }).catch((actionError) => setError(actionError instanceof Error ? actionError.message : "Unable to accept the transfer."))}>
                      Accept receipt
                    </Button>
                  </div>
                ))}
              </Card>
            )}

            <div className="space-y-4">
              {STATUS_ORDER.map((status) => {
                const items = process.queue.filter((item) => item.status === status);
                return (
                  <section key={status} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-slate-900">{status === "UNASSIGNED" ? "Unassigned pool" : status.replace(/_/g, " ")}</h2>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{items.length}</span>
                    </div>
                    {items.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-500">No work in this status.</div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((item) => (
                          <Card key={item.id} className="border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{item.workOrderNo}</p>
                                <p className="mt-1 text-xl font-bold text-slate-900">{item.quantity.toLocaleString("en-IN")} pcs</p>
                              </div>
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{item.status.replace(/_/g, " ")}</span>
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-slate-500">
                              <p>{item.laborerName ?? item.contractorName ?? "General pool"}</p>
                              {item.scannedBy && <p>Scanned by: {item.scannedBy}</p>}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {item.status === "UNASSIGNED" && <Button type="button" size="lg" className="flex-1" onClick={() => void handleAssign(item)}>Assign batch</Button>}
                              {item.status === "ASSIGNED" && <Button type="button" size="lg" className="flex-1" onClick={() => void executeAction("scan", { logId: item.id }).catch((actionError) => setError(actionError instanceof Error ? actionError.message : "Unable to start the batch."))}>Start work</Button>}
                              {item.status === "IN_PROGRESS" && <Button type="button" size="lg" className="flex-1" onClick={() => void executeAction("complete", { logId: item.id }).catch((actionError) => setError(actionError instanceof Error ? actionError.message : "Unable to complete the batch."))}>Complete work</Button>}
                              {item.status === "COMPLETED" && <Button type="button" size="lg" variant="outline" className="flex-1" onClick={() => void executeAction("transfer", { workOrderId: item.workOrderId, logId: item.id }).catch((actionError) => setError(actionError instanceof Error ? actionError.message : "Unable to transfer output."))}>Transfer output</Button>}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </Section>
    </Page>
  );
}
