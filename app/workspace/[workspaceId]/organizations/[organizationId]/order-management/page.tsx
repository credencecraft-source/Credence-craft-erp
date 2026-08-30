import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

const ORDER_HOME_MODULES = [
  {
    title: "Merchandising",
    description: "Merchandising operations and product planning.",
    href: "merchandising",
  },
  {
    title: "Purchase",
    description: "Purchase operations and supplier workflow.",
    href: "purchase",
  },
] as const;

export default async function OrderManagementHomePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {ORDER_HOME_MODULES.map((module) => (
          <Link
            key={module.title}
            href={`/workspace/${workspaceId}/organizations/${organizationId}/order-management/${module.href}`}
            className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_35px_rgba(16,185,129,0.08)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Module</p>
            <h4 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">{module.title}</h4>
            <p className="mt-2 text-sm text-slate-600">{module.description}</p>
            <div className="mt-5 flex items-center justify-between text-sm font-medium text-emerald-700">
              <span>Open</span>
              <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Open orders</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <p className="text-3xl font-semibold text-slate-900">1,482</p>
          <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Live
          </span>
        </div>
      </div>
    </div>
  );
}