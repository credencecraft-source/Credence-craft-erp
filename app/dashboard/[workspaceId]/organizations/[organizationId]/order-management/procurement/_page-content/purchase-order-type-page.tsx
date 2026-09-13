"use client";

import { ArrowLeft, ArrowRight, Boxes, Layers3 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function PurchaseOrderTypePage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex items-center gap-3 border-b border-slate-200 pb-5">
      <button type="button" onClick={() => router.push(procurementPath)} aria-label="Back to procurement" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
      <div><p className="erp-eyebrow">Procurement / Purchase orders</p><h1 className="erp-page-heading mt-1">Choose PO type</h1><p className="mt-1 text-sm text-slate-500">Select the purchase order workflow you want to open.</p></div>
    </header>

    <section className="grid gap-4 lg:grid-cols-2">
      <PoTypeCard title="General PO" detail="Create a standard purchase order for general procurement requirements." icon={Boxes} onClick={() => router.push(`${procurementPath}/create-po/general-po/allocate-vendor`)} />
      <PoTypeCard title="Style Wise PO" detail="Group raw-material requirements by style, allocate vendors, and create purchase orders." icon={Layers3} onClick={() => router.push(`${procurementPath}/create-po/style-wise`)} />
    </section>
  </div>;
}

function PoTypeCard({ title, detail, icon: Icon, onClick }: { title: string; detail: string; icon: typeof Boxes; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group erp-surface flex min-h-56 flex-col justify-between p-6 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span>
    <span className="mt-8 block"><span className="flex items-center justify-between gap-3 text-lg font-bold text-slate-950">{title}<ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" /></span><span className="mt-2 block max-w-md text-sm leading-6 text-slate-500">{detail}</span></span>
  </button>;
}