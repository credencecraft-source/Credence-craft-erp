"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Skeleton from "@/components/ui/Skeleton";
import Section from "@/components/ui/Section";
import {
  consolidateShopFloorProcesses,
  getShopFloorFlowTotals,
  type ShopFloorProcessBoard,
  type ShopFloorProcessBoardRow,
  type ShopFloorStatusKey,
} from "@/lib/services/factory/shop-floor-board";

const STATUS_ORDER: ShopFloorStatusKey[] = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "TRANSFERRED"];

function normalizeProcessName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchProcesses(organizationId: string, processName?: string) {
  const query = new URLSearchParams({ organizationId });
  if (processName) query.set("processName", processName);
  const response = await fetch(`/api/factory/production/shop-floor?${query.toString()}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load this process.");
  return consolidateShopFloorProcesses((data.processes ?? []) as ShopFloorProcessBoardRow[]);
}

export default function ShopFloorProcessPage({
  workspaceId,
  organizationId,
  processSlug,
  processName,
}: {
  workspaceId: string;
  organizationId: string;
  processSlug: string;
  processName?: string;
}) {
  const router = useRouter();
  const [processes, setProcesses] = useState<ShopFloorProcessBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchProcesses(organizationId, processName)
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
  }, [organizationId, processName]);

  const process = processes.find((item) => normalizeProcessName(item.processName) === normalizeProcessName(processSlug));
  const flowTotals = process ? getShopFloorFlowTotals(process.statusCounts) : null;

  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor`;
  const processPath = `${basePath}/${encodeURIComponent(processSlug)}`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Button type="button" variant="ghost" onClick={() => router.push(basePath)}>
              &larr; All processes
            </Button>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Factory Management · Shop Floor</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              {process?.processName ?? (loading ? <Skeleton className="h-9 w-48" /> : "Process")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">View work orders and manage quantities by status for this process.</p>
          </div>
          {process && flowTotals && (
            <div>
              <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-3">
                {[
                  { label: "In", value: flowTotals.in },
                  { label: "Out", value: flowTotals.out },
                  { label: "Balance in hand (WIP)", value: flowTotals.balanceInHand },
                ].map(({ label, value }) => (
                  <Card key={label} className="border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{value.toLocaleString("en-IN")} pcs</p>
                  </Card>
                ))}
              </div>
              <p className="mt-2 text-right text-xs text-slate-500">{process.workOrderCount} work orders</p>
            </div>
          )}
        </div>

        {loading && (
          <div
            role="status"
            aria-label="Loading process status"
            className="min-w-0 max-w-full overflow-x-auto pb-2"
            tabIndex={0}
          >
            <div className="grid min-w-[72rem] grid-cols-5 items-start gap-4">
              {STATUS_ORDER.map((status) => (
                <Card key={status} className="space-y-4 bg-[var(--erp-surface-soft)] p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  {Array.from({ length: 3 }, (_, index) => (
                    <Card key={index} className="space-y-3 p-4">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-6 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </Card>
                  ))}
                </Card>
              ))}
            </div>
          </div>
        )}
        {error && <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>}
        {!loading && !error && !process && (
          <Card className="border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">This process was not found.</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => router.push(basePath)}>Return to processes</Button>
          </Card>
        )}

        {!loading && !error && process && (
          <>
            {process.incomingTransfers.length > 0 && (
              <Card className="space-y-3 border-slate-200 bg-white p-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Incoming transfers</h2>
                  <p className="mt-1 text-sm text-slate-600">Accept receipt to place the quantity into this process pool.</p>
                </div>
                {process.incomingTransfers.map((transfer) => (
                  <Link
                    key={transfer.id}
                    href={`${processPath}/transfer/${encodeURIComponent(transfer.id)}?workOrderId=${encodeURIComponent(transfer.workOrderId)}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{transfer.workOrderNo} · {transfer.quantity} pcs</p>
                      <p className="mt-1 text-xs text-slate-500">From {transfer.fromProcessName}</p>
                    </div>
                    <span className="text-sm font-semibold text-brand-600">Review receipt</span>
                  </Link>
                ))}
              </Card>
            )}

            <div
              aria-label="Shop-floor status board"
              className="min-w-0 max-w-full overflow-x-auto pb-2"
              role="region"
              tabIndex={0}
            >
              <div className="grid min-w-[72rem] grid-cols-5 items-start gap-4">
              {STATUS_ORDER.map((status) => {
                const items = process.queue.filter((item) => item.status === status);
                return (
                  <section key={status} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <header className="mb-3 flex min-h-14 items-start justify-between gap-2 border-b border-slate-200 pb-3">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">{status === "UNASSIGNED" ? "Unassigned pool" : status.replace(/_/g, " ")}</h2>
                        <p className="mt-1 text-xs text-slate-500">{process.statusCounts[status].toLocaleString("en-IN")} pcs</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{items.length}</span>
                    </header>
                    {items.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-500">No work in this status.</div>
                    ) : (
                      <div className="space-y-3">
                        {items.map((item) => (
                          <Link
                            key={item.id}
                            href={`${processPath}/operation/${encodeURIComponent(item.id)}?workOrderId=${encodeURIComponent(item.workOrderId)}`}
                            className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Card className="border-slate-200 bg-white p-4 transition-colors hover:border-brand-500">
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
                              <p className="mt-4 text-xs font-semibold text-brand-600">Open operation</p>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
              </div>
            </div>
          </>
        )}
      </Section>
    </Page>
  );
}
