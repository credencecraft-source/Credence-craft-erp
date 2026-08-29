"use client";

import AppShell from "../components/AppShell";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const againstBomSteps = ["Find Vendors", "Verify Price", "Create PO"] as const;
const generalSteps = ["Request", "Find Vendors", "Create PO"] as const;
type RawMaterialStep = "Request" | "Find Vendors" | "Verify Price" | "Create PO";
const rawMaterialSections = ["Against BOM", "General"] as const;
type RawMaterialSection = (typeof rawMaterialSections)[number];
const poStatuses = ["Draft", "Waiting for Approval", "Approved", "Issued", "Received", "Closed"] as const;
type PoStatus = (typeof poStatuses)[number];

export default function PurchasePage() {
  const pathname = usePathname();
  const [searchParams, setSearchParams] = useState<URLSearchParams>(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams());
  useEffect(() => {
    setSearchParams(new URLSearchParams(window.location.search));
  }, [pathname]);

  const selectedType = searchParams.get("type") === "finished" ? "finished" : "raw";
  const selectedTab = selectedType === "finished" ? "Finished Goods Purchase" : "Raw Material Purchase";
  const approvalPanelOpen = searchParams.get("panel") === "approval";
  const [selectedRawMaterialSection, setSelectedRawMaterialSection] = useState<RawMaterialSection>("Against BOM");
  const [selectedStep, setSelectedStep] = useState<RawMaterialStep>("Find Vendors");
  const [selectedPoStatus, setSelectedPoStatus] = useState<PoStatus>("Draft");

  return (
    <AppShell>
      <div className="page-frame space-y-3">
        {approvalPanelOpen ? <ApprovalProcessTable type={selectedType} selectedStatus={selectedPoStatus} setSelectedStatus={setSelectedPoStatus} /> : selectedType === "raw" ? <RawMaterialPurchase selectedSection={selectedRawMaterialSection} setSelectedSection={setSelectedRawMaterialSection} selectedStep={selectedStep} setSelectedStep={setSelectedStep} selectedPoStatus={selectedPoStatus} setSelectedPoStatus={setSelectedPoStatus} /> : <section className="surface flex min-h-[260px] items-center justify-center p-6 text-center" role="tabpanel" aria-label={selectedTab}><p className="text-sm text-zinc-500">{selectedTab} is ready for its workflow definition.</p></section>}
      </div>
    </AppShell>
  );
}

function RawMaterialPurchase({ selectedSection, setSelectedSection, selectedStep, setSelectedStep, selectedPoStatus, setSelectedPoStatus }: { selectedSection: RawMaterialSection; setSelectedSection: (section: RawMaterialSection) => void; selectedStep: RawMaterialStep; setSelectedStep: (step: RawMaterialStep) => void; selectedPoStatus: PoStatus; setSelectedPoStatus: (status: PoStatus) => void }) {
  const sectionSteps = selectedSection === "Against BOM" ? againstBomSteps : generalSteps;
  const stepColumns: Record<RawMaterialStep, string[]> = {
    Request: ["Request number", "Material", "Quantity", "Required date", "Status"],
    "Find Vendors": ["Vendor", "Raw material", "Lead time", "Status"],
    "Verify Price": ["Vendor", "Raw material", "Quoted price", "Valid until"],
    "Create PO": ["PO number", "Vendor", "Total value", "Status"],
  };

  return (
    <section className="space-y-3" role="tabpanel" aria-label="Raw Material Purchase">
      <div className="inline-flex w-full rounded-lg border border-[#dce4dc] bg-white p-1 sm:w-auto" role="group" aria-label="Raw material purchase type">{rawMaterialSections.map((section) => <button key={section} type="button" aria-pressed={selectedSection === section} onClick={() => { setSelectedSection(section); setSelectedStep(section === "Against BOM" ? "Find Vendors" : "Request"); }} className={`flex-1 rounded-md px-4 py-2.5 text-xs font-semibold transition sm:flex-none ${selectedSection === section ? "bg-[#17372a] text-white" : "text-zinc-600 hover:text-emerald-800"}`}>{section}</button>)}</div>
      <div className="surface overflow-hidden">
        <div className="grid gap-2 p-3 sm:grid-cols-3" role="tablist" aria-label={`${selectedSection} steps`}>
          {sectionSteps.map((step, index) => <button key={step} type="button" role="tab" aria-selected={selectedStep === step} onClick={() => setSelectedStep(step)} className={`rounded-lg border px-3 py-3 text-left transition ${selectedStep === step ? "border-emerald-800 bg-emerald-800 text-white" : "border-[#dce4dc] bg-white text-zinc-700 hover:border-emerald-700/40"}`}><span className="block text-[9px] uppercase tracking-[0.14em] opacity-65">Step 0{index + 1}</span><span className="mt-1 block text-xs font-semibold">{step}</span></button>)}
        </div>
      </div>

      <section className="surface overflow-hidden"><div className="flex flex-col justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold text-zinc-950">{selectedStep}</h2><p className="mt-1 text-xs text-zinc-500">No records yet.</p></div><button type="button" className="button-primary w-fit px-3 py-2 text-xs">Start step</button></div><PurchaseTable columns={stepColumns[selectedStep]} /></section>
    </section>
  );
}

function ApprovalProcessTable({ type, selectedStatus, setSelectedStatus }: { type: "raw" | "finished"; selectedStatus: PoStatus; setSelectedStatus: (status: PoStatus) => void }) {
  return <section className="surface overflow-hidden"><div className="border-b border-zinc-100 px-4 py-3"><h2 className="text-sm font-semibold text-zinc-950">Approval Process</h2><p className="mt-1 text-xs text-zinc-500">Approval table for {type === "finished" ? "finished goods" : "raw material"} purchase.</p></div><div className="flex flex-wrap gap-1.5 border-b border-zinc-100 px-4 py-3" role="tablist" aria-label="Approval statuses">{poStatuses.map((status, index) => <button key={status} type="button" role="tab" aria-selected={selectedStatus === status} onClick={() => setSelectedStatus(status)} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition ${selectedStatus === status ? "bg-[#17372a] text-white" : "border border-[#dce4dc] bg-white text-zinc-600 hover:border-emerald-700/40 hover:text-emerald-800"}`}><span className={`grid size-4 place-items-center rounded-full text-[9px] ${selectedStatus === status ? "bg-emerald-300 text-[#17372a]" : "bg-zinc-100 text-zinc-500"}`}>{index + 1}</span>{status}</button>)}</div><PurchaseTable columns={["Purchase type", "PO number", "Submitted on", "Approver", "Status"]} status={`${type} ${selectedStatus.toLowerCase()}`} /></section>;
}

function PurchaseTable({ columns, status = "" }: { columns: string[]; status?: string }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[#f7faf7] text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"><tr>{columns.map((column) => <th key={column} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold sm:px-6">{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-zinc-500 sm:px-6">No {status ? `${status.toLowerCase()} ` : ""}records yet.</td></tr></tbody></table></div>;
}
