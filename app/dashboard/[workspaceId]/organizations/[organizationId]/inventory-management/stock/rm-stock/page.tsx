import Link from "next/link";
import { ArrowRight, Boxes, Layers3 } from "lucide-react";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const stockPath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/stock/rm-stock`;

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <header className="border-b border-slate-200 pb-4">
        <p className="erp-eyebrow">Inventory / Stock</p>
        <h1 className="erp-page-heading mt-1">RM Inventory</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">Choose a stock view.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <InventoryCard
          title="Style-wise Inventory"
          detail="View GRN allocations by order and style, with the existing allocation subform."
          href={`${stockPath}/style-wise-inventory`}
          icon={Layers3}
        />
        <InventoryCard
          title="General Inventory"
          detail="View raw material on-hand, reserved, and available quantities by location."
          href={`${stockPath}/general-inventory`}
          icon={Boxes}
        />
      </section>
    </main>
  );
}

function InventoryCard({ title, detail, href, icon: Icon }: {
  title: string;
  detail: string;
  href: string;
  icon: typeof Boxes;
}) {
  return (
    <Link href={href} className="group erp-surface flex min-h-44 flex-col justify-between p-6 transition hover:border-emerald-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-8 block">
        <span className="flex items-center justify-between gap-3 text-lg font-bold text-slate-950">
          {title}
          <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-700" />
        </span>
        <span className="mt-2 block max-w-md text-sm leading-6 text-slate-500">{detail}</span>
      </span>
    </Link>
  );
}