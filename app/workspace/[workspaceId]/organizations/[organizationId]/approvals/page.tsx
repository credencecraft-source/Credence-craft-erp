import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function ApprovalHomePage({
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

  const approvalModules: Array<{ title: string; description: string; href: string }> = [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-700">Central approval</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">Approval center</h3>
        <p className="mt-3 max-w-3xl text-slate-600">
          This is the central approval workspace for the ERP. The current scope focuses on master approval flow, while the rest of the modules can be connected later as needed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {approvalModules.map((module) => (
          <Link
            key={module.title}
            href={module.href}
            className="group rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_18px_35px_rgba(139,92,246,0.08)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-700">Module</p>
            <h4 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-900">{module.title}</h4>
            <p className="mt-2 text-sm text-slate-600">{module.description}</p>
            <div className="mt-5 flex items-center justify-between text-sm font-medium text-violet-700">
              <span>Open queue</span>
              <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}