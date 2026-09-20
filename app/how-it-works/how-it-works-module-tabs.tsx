"use client";

import { useState } from "react";
import {
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  CircleDollarSign,
  Factory,
  Gauge,
  Landmark,
  Layers3,
  ReceiptText,
  Ruler,
  ShieldCheck,
  Sparkles,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { ERP_MODULES, type ErpModule, type SubModuleOption } from "@/components/erp/erp-config-registry";

const moduleDetails: Record<string, { summary: string; outcome: string; icon: LucideIcon }> = {
  online: { summary: "Coordinate pre-order and ready-stock selling across B2B and B2C channels.", outcome: "See demand earlier and produce with more confidence.", icon: Gauge },
  pos: { summary: "Bring quick invoices, purchase bills, invoices, stock, vendors, and customers into one sales view.", outcome: "Reduce duplicate entry and keep commercial activity tied to stock.", icon: ReceiptText },
  "order-management": { summary: "Turn a buyer order into a clear production and purchasing plan.", outcome: "Reduce excess buying, missed details, and production surprises.", icon: ClipboardCheck },
  "design-development": { summary: "Turn design intent into usable tech packs and gold-seal development checkpoints.", outcome: "Protect the approved product definition before production starts.", icon: Sparkles },
  "factory-management": { summary: "Move from pre-production work orders to shop-floor production and scan-and-pack completion.", outcome: "Make every production stage visible and accountable.", icon: Factory },
  "quality-management-system": { summary: "Check raw materials and finished goods against quality requirements.", outcome: "Catch defects earlier and reduce rework, returns, and rejected output.", icon: ShieldCheck },
  "finance-management": { summary: "Record sales, purchasing, bills, notes, and delivery documents around the operational record.", outcome: "Give leaders a clearer view of margin, commitments, and cash movement.", icon: ReceiptText },
  "inventory-management": { summary: "Track inward receipts, outward material issues, and raw-material and finished-goods stock.", outcome: "Know what is available, where it is, and what is being consumed.", icon: Warehouse },
  "security-management": { summary: "Control gate entry and use gate-entry reports to maintain a dependable movement trail.", outcome: "Strengthen custody, accountability, and operational security.", icon: ShieldCheck },
  approvals: { summary: "Route master and purchase-order decisions through visible review points.", outcome: "Create control without slowing down the people doing the work.", icon: CheckCircle2 },
  settings: { summary: "Manage plans, users, and operational numbering for the organization.", outcome: "Scale with consistent access and cleaner administration.", icon: Boxes },
  admin: { summary: "Maintain the organization master data that powers lookups and shared decisions.", outcome: "Give every team the same vocabulary for products, partners, and operations.", icon: Boxes },
};

function renderChildren(children: SubModuleOption[], level = 0) {
  return (
    <ul className={level === 0 ? "mt-4 space-y-2" : "mt-2 space-y-1 border-l border-[#d9e3dc] pl-4"}>
      {children.map((child) => (
        <li key={`${level}-${child.key}-${child.pathSegment ?? child.href ?? "item"}`}>
          <div className="flex items-start gap-2 text-[12px] text-[#587066]"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a7c65a]" /><span>{child.label}</span></div>
          {child.children && renderChildren(child.children, level + 1)}
        </li>
      ))}
    </ul>
  );
}

function ModuleWorkflow({ module }: { module: ErpModule }) {
  const details = moduleDetails[module.key];
  const Icon = details.icon;

  return (
    <div className="grid gap-6 rounded-[1.35rem] border border-[#d9e3dc] bg-white p-5 shadow-[0_14px_45px_rgba(24,59,44,0.05)] sm:p-7 lg:grid-cols-[0.85fr_1.15fr]">
      <div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf5e7] text-[#6d8c46]"><Icon size={20} /></div>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#93a39a]">Module purpose</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[#183b2c]">{module.label}</h3>
        <p className="mt-3 text-[13px] leading-6 text-[#587066]">{details.summary}</p>
        <p className="mt-5 border-l-2 border-[#a7c65a] pl-3 text-[12px] font-semibold leading-5 text-[#183b2c]">{details.outcome}</p>
      </div>
      <div className="border-t border-[#e7eee8] pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        {module.key === "order-management" ? <OrderManagementWorkflow /> : <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6d8c46]">Related workflow</p>
          <p className="mt-2 text-[13px] leading-6 text-[#587066]">Follow these configured functions to move work through {module.label.toLowerCase()}.</p>
          {renderChildren(module.children)}
        </>}
      </div>
    </div>
  );
}

const orderWorkflowLanes = [
  {
    key: "merchandising",
    label: "Merchandising order",
    icon: Layers3,
    title: "From buyer request to production-ready order",
    description: "Capture the style, quantity, sizes, materials, cost, and delivery promise in one place.",
    steps: [
      ["1. Create the order", "Select buyer, brand, article, season, colours, size group, quantity, and delivery date."],
      ["2. Plan the make", "Set the size mix, BOM, costing, tech pack, measurements, and production process."],
      ["3. Release with control", "Move the order through approval and work-order stages with one shared source record."],
    ],
  },
  {
    key: "procurement",
    label: "Procurement handoff",
    icon: Truck,
    title: "From material need to approved purchase order",
    description: "Use the order BOM to buy the right material, quantity, and price from the right supplier.",
    steps: [
      ["1. Allocate vendor", "Group BOM requirements and assign the supplier."],
      ["2. Approve price", "Check price, GST, HSN, UOM, MOQ, and other charges."],
      ["3. Create PO", "Convert the approved requirement into a traceable purchase order."],
    ],
  },
];

function OrderManagementWorkflow() {
  const [activeLane, setActiveLane] = useState(orderWorkflowLanes[0].key);
  const lane = orderWorkflowLanes.find((item) => item.key === activeLane) ?? orderWorkflowLanes[0];
  const LaneIcon = lane.icon;

  return (
    <div>
      <div className="mb-5 rounded-xl border border-[#d9e3dc] bg-[#f3f6f1] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6d8c46]">Fast-fashion toolkit</p>
        <p className="mt-2 text-[13px] font-semibold text-[#183b2c]">Less quantity. More styles. Faster decisions.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            "Quick order entry",
            "Low-quantity, multi-style planning",
            "BOM and costing control",
            "Tech pack and measurements",
            "Size-wise finished goods",
            "Approval to production handoff",
          ].map((feature) => <div key={feature} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-[11px] font-medium text-[#587066]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a7c65a]" />{feature}</div>)}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-[#e7eee8]" role="tablist" aria-label="Order Management workflows">
        {orderWorkflowLanes.map((item) => {
          const isActive = item.key === lane.key;
          const Icon = item.icon;
          return <button key={item.key} type="button" role="tab" aria-selected={isActive} onClick={() => setActiveLane(item.key)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 text-[11px] font-semibold ${isActive ? "border-[#183b2c] text-[#183b2c]" : "border-transparent text-[#789087] hover:text-[#183b2c]"}`}><Icon size={14} />{item.label}</button>;
        })}
      </div>
      <div className="pt-5" role="tabpanel" aria-label={`${lane.label} workflow`}>
        <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf5e7] text-[#6d8c46]"><LaneIcon size={17} /></span><div><p className="text-[15px] font-semibold text-[#183b2c]">{lane.title}</p><p className="mt-1 text-[12px] leading-5 text-[#587066]">{lane.description}</p></div></div>
        <div className="mt-5 space-y-3">
          {lane.steps.map(([label, detail], index) => <div key={label} className="flex gap-3 rounded-lg border border-[#e7eee8] bg-[#fbfdf9] p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#183b2c] text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span><div><p className="text-[12px] font-semibold text-[#183b2c]">{label}</p><p className="mt-1 text-[11px] leading-5 text-[#587066]">{detail}</p></div></div>)}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-[#d9e3dc] bg-[#f3f6f1] p-3"><Landmark size={15} className="text-[#6d8c46]" /><p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#183b2c]">India-ready</p><p className="mt-1 text-[11px] leading-4 text-[#587066]">GST state logic supports domestic buying decisions.</p></div>
          <div className="rounded-lg border border-[#d9e3dc] bg-[#f3f6f1] p-3"><CircleDollarSign size={15} className="text-[#6d8c46]" /><p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#183b2c]">Less wastage</p><p className="mt-1 text-[11px] leading-4 text-[#587066]">BOM quantities connect orders to material buying.</p></div>
          <div className="rounded-lg border border-[#d9e3dc] bg-[#f3f6f1] p-3"><Ruler size={15} className="text-[#6d8c46]" /><p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#183b2c]">Better fit</p><p className="mt-1 text-[11px] leading-4 text-[#587066]">Size groups support consistent Indian apparel production.</p></div>
        </div>
      </div>
    </div>
  );
}

export default function ModuleTabs() {
  const visibleModules = ERP_MODULES.filter((module) => module.key === "order-management");
  const activeModule = visibleModules[0];

  if (!activeModule) return null;

  return (
    <div className="mt-10">
      <div className="mt-5" role="tabpanel" aria-label={`${activeModule.label} workflow`}>
        <ModuleWorkflow module={activeModule} />
      </div>
    </div>
  );
}