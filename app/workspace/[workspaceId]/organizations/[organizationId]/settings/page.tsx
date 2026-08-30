import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function SettingsPage({
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
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Module ready</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">System configuration overview</h3>
        <p className="mt-3 max-w-3xl text-slate-600">
          This module page is ready for company configuration, roles, permissions, integrations, and governance controls.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Users", value: "42", tone: "emerald" },
          { label: "Roles", value: "11", tone: "sky" },
          { label: "Integrations", value: "8", tone: "violet" },
          { label: "Audit", value: "99%", tone: "amber" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{card.label}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">{card.value}</p>
            <div className="mt-3 h-2 rounded-full bg-emerald-100">
              <div
                className={`h-2 rounded-full ${
                  card.tone === "emerald"
                    ? "w-3/4 bg-emerald-500"
                    : card.tone === "sky"
                      ? "w-2/3 bg-sky-500"
                      : card.tone === "violet"
                        ? "w-4/5 bg-violet-500"
                        : "w-3/5 bg-amber-500"
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Master data</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Master modules</h3>
          </div>
          <Link
            href={`/workspace/${workspaceId}/organizations/${organizationId}/settings/masters`}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            Open masters
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-1">
          <Link
            href={`/workspace/${workspaceId}/organizations/${organizationId}/approvals`}
            className="rounded-2xl border border-violet-200 bg-violet-50 p-4 transition hover:border-violet-300 hover:bg-violet-100/80"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-700">Central approval</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-900">Centralized approvals</h4>
            <p className="mt-2 text-sm text-slate-600">Track the approval workflow by module with dedicated sub-tabs for key ERP areas.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}