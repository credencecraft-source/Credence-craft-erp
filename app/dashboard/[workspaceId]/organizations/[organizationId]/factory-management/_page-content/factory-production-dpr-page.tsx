"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");
type ProcessCard = { processName: string; dates: Array<{ grnCount: number; receivedQty: number; actualMade: number }> };

export default function FactoryProductionDprPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const [processCards, setProcessCards] = useState<ProcessCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/factory/production/dpr?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load process cards.");
        setProcessCards(data.activity?.processCards ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load process cards."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  return <Page as="div"><Section>{loading ? <Card className="p-6 text-sm text-slate-600">Loading process cards...</Card> : error ? <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{processCards.map((process) => { const summary = process.dates.reduce((total, item) => ({ grnCount: total.grnCount + item.grnCount, receivedQty: total.receivedQty + item.receivedQty, actualMade: total.actualMade + item.actualMade }), { grnCount: 0, receivedQty: 0, actualMade: 0 }); return <Link key={process.processName} href={`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor/dpr/${encodeURIComponent(process.processName)}`} className="group block"><Card className="border-slate-200 p-5 transition hover:border-emerald-400 hover:shadow-md"><div className="flex items-center justify-between gap-3"><h1 className="text-xl font-bold text-slate-900">{process.processName}</h1><span className="text-xs font-semibold text-emerald-700">Open -&gt;</span></div><div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4"><div><p className="text-[10px] uppercase text-slate-500">GRNs</p><p className="mt-1 font-bold text-slate-900">{summary.grnCount}</p></div><div><p className="text-[10px] uppercase text-slate-500">Made</p><p className="mt-1 font-bold text-emerald-700">{quantity(summary.actualMade)}</p></div><div><p className="text-[10px] uppercase text-slate-500">Received</p><p className="mt-1 font-bold text-sky-700">{quantity(summary.receivedQty)}</p></div></div></Card></Link>; })}</div>}</Section></Page>;
}
