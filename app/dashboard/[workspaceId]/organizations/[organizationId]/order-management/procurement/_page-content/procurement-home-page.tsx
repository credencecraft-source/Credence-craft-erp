"use client";

import { ArrowRight, ClipboardCheck, FileText, PackageSearch, Plus, ShieldCheck, Truck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function ProcurementHomePage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementBasePath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;

  const goToCreatePo = () => router.push(`${procurementBasePath}/create-po`);

  const stages = [
    { number: "01", label: "Allocate vendor", icon: PackageSearch, active: true },
    { number: "02", label: "Approve price", icon: ClipboardCheck, active: false },
    { number: "03", label: "Create PO", icon: ShieldCheck, active: false },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="erp-eyebrow">Order Management / Procurement</p>
          <h1 className="erp-page-heading mt-1">Procurement control centre</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Convert approved material requirements into controlled, approval-ready purchase orders.</p>
        </div>
        <button type="button" onClick={goToCreatePo} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Create purchase order
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Open requisitions", value: "18", note: "Ready for allocation", icon: PackageSearch, tone: "text-amber-600 bg-amber-50" },
          { label: "Price approvals", value: "07", note: "Ready for review", icon: ClipboardCheck, tone: "text-blue-600 bg-blue-50" },
          { label: "POs this month", value: "42", note: "12% above last month", icon: FileText, tone: "text-emerald-700 bg-emerald-50" },
          { label: "Active vendors", value: "64", note: "Across 8 categories", icon: Truck, tone: "text-violet-600 bg-violet-50" },
        ].map(({ label, value, note, icon: Icon, tone }) => (
          <div key={label} className="erp-surface p-5">
            <div className="flex items-start justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
              <span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </div>

      <div className="erp-surface px-3 py-3">
        <div className="flex items-center justify-between gap-2 pb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Procurement flow</p>
            <h2 className="mt-1 text-sm font-bold text-slate-900">Style wise procurement</h2>
          </div>
          <button type="button" onClick={goToCreatePo} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
            Open Create PO <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {stages.map(({ number, label, icon: Icon, active }) => (
            <div key={number} className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}>
                {number}
              </span>
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="truncate text-[10px] font-semibold text-slate-700">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}