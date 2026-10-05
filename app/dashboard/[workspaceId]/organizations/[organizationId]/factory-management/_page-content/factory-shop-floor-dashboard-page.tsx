"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import {
  consolidateShopFloorProcesses,
  type ShopFloorProcessBoard,
  type ShopFloorProcessBoardRow,
  type ShopFloorStatusKey,
} from "@/lib/services/factory/shop-floor-board";

const STATUS_ORDER: ShopFloorStatusKey[] = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "TRANSFERRED"];

async function fetchBoard(organizationId: string) {
  const response = await fetch(`/api/factory/production/shop-floor?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load the shop-floor board.");
  return consolidateShopFloorProcesses((data.processes ?? []) as ShopFloorProcessBoardRow[]);
}

export default function FactoryShopFloorDashboardPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "";
  const workspaceId = params?.workspaceId ?? "";
  const [processes, setProcesses] = useState<ShopFloorProcessBoard[]>([]);
  const [loading, setLoading] = useState(Boolean(organizationId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    let active = true;
    void fetchBoard(organizationId)
      .then((nextProcesses) => {
        if (!active) return;
        setProcesses(nextProcesses);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the shop-floor board.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [organizationId]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Factory Management</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Shop Floor</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Live process-board control with unassigned, assigned, in-progress, and completed quantities.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Unique Processes</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{processes.length}</p>
          </div>
        </div>

        {loading && <Card className="border-slate-200 p-6 text-sm text-slate-600">Loading shop-floor board...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>}

        {!loading && !error && processes.length > 0 && (
          <>
            <p className="text-sm text-slate-600">Select a process card to view its live shop-floor status and work queues.</p>
            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {processes.map((process) => (
                <Card key={process.id} className="overflow-hidden p-0">
                  <Button
                    type="button"
                    variant="card"
                    size="lg"
                    className="min-h-40 w-full rounded-none border-0 p-5 shadow-none hover:shadow-none"
                    onClick={() => {
                      const processSlug = process.processName.trim().toLocaleUpperCase().replace(/\s+/g, "-");
                      router.push(`/dashboard/${workspaceId}/organizations/${params.organizationId}/factory-management/production/shop-floor/${encodeURIComponent(processSlug)}`);
                    }}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block text-lg font-bold">{process.processName}</span>
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          {process.workOrderCount} work orders · {process.totalQty.toLocaleString("en-IN")} pcs
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
                        {process.queue.length} batches
                      </span>
                    </span>
                    <span className="mt-4 grid w-full grid-cols-5 gap-2 border-t border-slate-200 pt-3">
                      {STATUS_ORDER.map((status) => (
                        <span key={`${process.id}-${status}`} className="min-w-0 text-center">
                          <span className="block text-sm font-bold text-slate-900">{process.statusCounts[status].toLocaleString("en-IN")}</span>
                          <span className="mt-0.5 block truncate text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                            {status === "IN_PROGRESS" ? "In progress" : status === "UNASSIGNED" ? "Pool" : status.toLowerCase()}
                          </span>
                        </span>
                      ))}
                    </span>
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}

        {!loading && !error && processes.length === 0 && (
          <Card className="border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-base font-semibold text-slate-800">No shop-floor work is active yet.</p>
            <p className="mt-2 text-sm text-slate-500">Create a factory work order with a process template to begin the floor queue.</p>
          </Card>
        )}
      </Section>
    </Page>
  );
}
