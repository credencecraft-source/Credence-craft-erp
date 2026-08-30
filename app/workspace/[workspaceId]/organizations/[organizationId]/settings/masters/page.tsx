import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";
import { MASTER_DEFINITIONS } from "@/lib/master-data";

export default async function MastersPage({
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Master registry</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">All master modules</h3>
        <p className="mt-3 max-w-3xl text-slate-600">
          This is the central list for all ERP masters. Add any new master here and use it across order forms, subforms, and downstream modules.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MASTER_DEFINITIONS.map((master) => (
          <Link
            key={master.key}
            href={`/workspace/${workspaceId}/organizations/${organizationId}/settings/masters/${master.key}`}
            className="group rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_35px_rgba(20,83,45,0.1)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Master</p>
              <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">Active</span>
            </div>
            <h4 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-900">{master.label}</h4>
            <p className="mt-2 text-sm text-slate-600">{master.description}</p>
            <div className="mt-5 flex items-center justify-between text-sm font-medium text-emerald-700">
              <span>Open module</span>
              <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}