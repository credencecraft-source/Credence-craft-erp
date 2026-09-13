"use client";

import { ArrowLeft, ArrowRight, Check, ClipboardCheck, FilePlus2, PackageSearch } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export type GeneralPurchaseOrderStage = "allocate-vendor" | "approve-price" | "create-po";

const stages: Array<{ key: GeneralPurchaseOrderStage; number: string; label: string; icon: typeof PackageSearch }> = [
  { key: "allocate-vendor", number: "01", label: "Allocate vendor", icon: PackageSearch },
  { key: "approve-price", number: "02", label: "Approve price", icon: ClipboardCheck },
  { key: "create-po", number: "03", label: "Create PO", icon: FilePlus2 },
];

export default function GeneralPurchaseOrderStagePage({ stage }: { stage: GeneralPurchaseOrderStage }) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/create-po/general-po`;
  const typeSelectionPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/create-po`;
  const currentStage = stages.find((item) => item.key === stage) ?? stages[0];
  const nextStage = stages[stages.findIndex((item) => item.key === stage) + 1];

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex items-center gap-3 border-b border-slate-200 pb-5">
      <button type="button" onClick={() => router.push(typeSelectionPath)} aria-label="Back to PO type selection" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
      <div><p className="erp-eyebrow">Procurement / General PO</p><h1 className="erp-page-heading mt-1">{currentStage.label}</h1><p className="mt-1 text-sm text-slate-500">General purchase order workflow</p></div>
    </header>

    <nav className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:grid-cols-3" aria-label="General PO stages">
      {stages.map((item) => <button key={item.key} type="button" onClick={() => router.push(`${basePath}/${item.key}`)} className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-left ${item.key === stage ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-emerald-300"}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${item.key === stage ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}>{item.number}</span><item.icon className="h-4 w-4 text-slate-500" /><span className="text-xs font-semibold text-slate-700">{item.label}</span></button>)}
    </nav>

    <section className="erp-surface overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Stage {currentStage.number}</p><h2 className="mt-1 text-base font-bold text-slate-950">{stageTitle(stage)}</h2><p className="mt-1 text-xs text-slate-500">{stageDescription(stage)}</p></div>
      <div className="space-y-5 p-5">{stage === "allocate-vendor" && <AllocationPanel />}{stage === "approve-price" && <PricePanel />}{stage === "create-po" && <CreatePanel />}</div>
      <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">{nextStage ? <button type="button" onClick={() => router.push(`${basePath}/${nextStage.key}`)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">Continue to {nextStage.label} <ArrowRight className="h-4 w-4" /></button> : <button type="button" onClick={() => router.push(typeSelectionPath)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"><Check className="h-4 w-4" /> Finish review</button>}</div>
    </section>
  </div>;
}

function stageTitle(stage: GeneralPurchaseOrderStage) {
  return stage === "allocate-vendor" ? "Allocate vendor to general requirements" : stage === "approve-price" ? "Review and approve vendor price" : "Create general purchase order";
}

function stageDescription(stage: GeneralPurchaseOrderStage) {
  return stage === "allocate-vendor" ? "Choose a vendor and prepare the general purchase order lines." : stage === "approve-price" ? "Confirm pricing and charges before the PO is created." : "Review the approved details and create the purchase order.";
}

function AllocationPanel() {
  return <div className="grid gap-4 md:grid-cols-2"><Field label="Vendor" placeholder="Select vendor" /><Field label="Requirement group" placeholder="Select requirement group" /><Field label="Reference number" placeholder="Enter reference number" /><Field label="Required date" placeholder="Select date" type="date" /><div className="md:col-span-2"><Field label="Notes" placeholder="Add a note for this general PO" /></div></div>;
}

function PricePanel() {
  return <div className="grid gap-4 md:grid-cols-3"><Summary label="Vendor" value="Selected general PO vendor" /><Summary label="Lines ready for review" value="0 lines" /><Field label="Vendor price" placeholder="Enter vendor price" type="number" /><Field label="Other charges" placeholder="Enter other charges" type="number" /><Field label="Currency" placeholder="INR" /><div className="md:col-span-3"><Field label="Approval note" placeholder="Add approval note" /></div></div>;
}

function CreatePanel() {
  return <div className="grid gap-3 sm:grid-cols-3"><Summary label="Vendor" value="Ready for review" /><Summary label="Price status" value="Approved" /><Summary label="PO number" value="Generated on create" /></div>;
}

function Field({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><input type={type} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-500" /></label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-sm font-semibold text-slate-900">{value}</p></div>;
}