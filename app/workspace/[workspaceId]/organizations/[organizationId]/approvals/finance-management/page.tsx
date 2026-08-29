import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

const ITEMS = [
  { name: "Debit note approval", status: "Pending" },
  { name: "Payment run approval", status: "Waiting" },
  { name: "GST reconciliation approval", status: "Approved" },
] as const;

export default async function ApprovalFinanceManagementPage({
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
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      value="approvals"
      moduleLabel="Approvals"
      title="Finance Management approvals"
      description="Approval queue for financial transactions, reconciliations, and payment approvals."
      subItems={[]}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-700">Finance management</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Approval queue</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ITEMS.map((item) => (
            <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-700">Request</p>
              <h4 className="mt-3 text-lg font-semibold text-slate-900">{item.name}</h4>
              <div className="mt-4 flex items-center justify-between">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.status === "Approved" ? "bg-emerald-100 text-emerald-700" : item.status === "Waiting" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}>
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MasterModuleShell>
  );
}
