"use client";

import { ArrowRight, ClipboardCheck, FilePlus2, Loader2, PackageCheck, PackageSearch } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProcurementSummary = {
  pendingVendorAllocation: number;
  pendingPriceApproval: number;
  readyForPo: number;
  totalOpen: number;
};

const emptySummary: ProcurementSummary = {
  pendingVendorAllocation: 0,
  pendingPriceApproval: 0,
  readyForPo: 0,
  totalOpen: 0,
};

const formatNumber = (value: number) => value.toLocaleString("en-IN");

export default function ProcurementHomePage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;
  const [summary, setSummary] = useState<ProcurementSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch(`/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}&view=summary`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load procurement insights.");
        if (mounted) setSummary(data);
      })
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load procurement insights.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [organizationId]);

  const openWorkflow = () => router.push(`${procurementPath}/create-po/style-wise`);

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
      <div>
        <p className="erp-eyebrow">Order Management / Procurement</p>
        <h1 className="erp-page-heading mt-1">Procurement overview</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">A quick view of work waiting across the procurement workflow.</p>
      </div>
      <button type="button" onClick={openWorkflow} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
        Open procurement workflow <ArrowRight className="h-4 w-4" />
      </button>
    </header>

    {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

    {loading ? <div className="erp-surface flex min-h-52 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading procurement insights</div> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Procurement insights">
        <InsightCard label="Pending vendor allocation" value={summary.pendingVendorAllocation} detail="BOM items waiting for a vendor" icon={PackageSearch} tone="amber" />
        <InsightCard label="Pending price approval" value={summary.pendingPriceApproval} detail="Grouped POs awaiting review" icon={ClipboardCheck} tone="blue" />
        <InsightCard label="Ready to create PO" value={summary.readyForPo} detail="Approved grouped POs" icon={FilePlus2} tone="emerald" />
        <InsightCard label="Open procurement work" value={summary.totalOpen} detail="Items across all queues" icon={PackageCheck} tone="slate" />
      </section>

      <section className="erp-surface overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Workflow</p>
          <h2 className="mt-1 text-base font-bold text-slate-950">Move work forward</h2>
        </div>
        <div className="grid gap-0 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <WorkflowStep number="01" title="Allocate vendor" detail="Assign vendors to pending requirements." onClick={openWorkflow} />
          <WorkflowStep number="02" title="Approve price" detail="Review submitted vendor pricing." onClick={openWorkflow} />
          <WorkflowStep number="03" title="Create PO" detail="Convert approved records into POs." onClick={openWorkflow} />
        </div>
      </section>
    </>}
  </div>;
}

function InsightCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof PackageSearch; tone: "amber" | "blue" | "emerald" | "slate" }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return <article className="erp-surface p-5">
    <div className="flex items-start justify-between gap-3"><p className="max-w-[12rem] text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}><Icon className="h-4 w-4" /></span></div>
    <p className="mt-6 text-3xl font-bold tracking-tight text-slate-950">{formatNumber(value)}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </article>;
}

function WorkflowStep({ number, title, detail, onClick }: { number: string; title: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex items-center gap-4 px-5 py-5 text-left transition hover:bg-emerald-50/60">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{number}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-950">{title}</span><span className="mt-1 block text-xs text-slate-500">{detail}</span></span>
    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" />
  </button>;
}