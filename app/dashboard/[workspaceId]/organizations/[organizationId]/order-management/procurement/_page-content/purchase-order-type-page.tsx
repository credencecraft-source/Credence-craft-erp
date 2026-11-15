"use client";

import { ArrowRight, Boxes, Layers3 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function PurchaseOrderTypePage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;

  return <div className="mx-auto max-w-6xl space-y-6">
    <h1 className="erp-page-heading">Choose PO type</h1>

    <section className="grid gap-4 lg:grid-cols-2">
      <PoTypeCard title="General PO" detail="Create a standard purchase order for general procurement requirements." icon={Boxes} onClick={() => router.push(`${procurementPath}/create-po/general-po/allocate-vendor`)} />
      <PoTypeCard title="Style Wise PO" detail="Group raw-material requirements by style, allocate vendors, and create purchase orders." icon={Layers3} onClick={() => router.push(`${procurementPath}/create-po/style-wise`)} />
    </section>
  </div>;
}

function PoTypeCard({ title, detail, icon: Icon, onClick }: { title: string; detail: string; icon: typeof Boxes; onClick: () => void }) {
  return <Button type="button" variant="secondary" size="lg" onClick={onClick} className="group erp-surface h-auto min-h-56 w-full flex-col items-start justify-between p-6 text-left">
    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span>
    <span className="mt-8 block"><span className="flex items-center justify-between gap-3 text-lg font-bold text-slate-950">{title}<ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" /></span><span className="mt-2 block max-w-md text-sm leading-6 text-slate-500">{detail}</span></span>
  </Button>;
}