import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";
import { listApprovalRequestsForOrganization, updateApprovalRequestStatus } from "@/lib/master-data";

async function handleApprovalAction(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const action = String(formData.get("action") ?? "approve");

  if (!workspaceId || !organizationId || !requestId) {
    return;
  }

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

  const request = (await listApprovalRequestsForOrganization(organization.id)).find(
    (entry) => entry.id === requestId || entry.request_id === requestId,
  );

  if (!request) {
    return;
  }

  const nextStatus = action === "approve" ? "approved" : "rejected";
  await updateApprovalRequestStatus(organization.id, request.request_id || request.id, nextStatus, user.full_name || user.email);

  revalidatePath(`/workspace/${workspaceId}/organizations/${organizationId}/approvals/setting/master`);
}

export default async function ApprovalSettingMasterPage({
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

  const approvalRequests = await listApprovalRequestsForOrganization(organization.id);
  const pendingRequests = approvalRequests.filter((request) => request.status === "pending");

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      value="approvals"
      moduleLabel="Approvals"
      title="Masters"
      description="Pending master approval requests."
      subItems={[
        {
          key: "masters",
          label: "Masters",
          href: `/workspace/${workspaceId}/organizations/${organizationId}/approvals/setting/master`,
          count: pendingRequests.length,
        },
      ]}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pending approvals</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">
            {pendingRequests.length === 0 ? "There is nothing to approve" : `${pendingRequests.length} records waiting for action`}
          </h3>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <p className="text-base font-medium text-slate-700">There is nothing to approve</p>
            <p className="mt-2 text-sm text-slate-500">No pending approval requests for this organization.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_12px_35px_rgba(20,83,45,0.06)]">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-emerald-50/70 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                <tr>
                  <th className="px-4 py-3">Master</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
                {pendingRequests.map((request) => (
                  <tr key={request.id} className="align-top hover:bg-emerald-50/40">
                    <td className="px-4 py-4 font-medium text-slate-900">{request.entity_label}</td>
                    <td className="px-4 py-4">{request.module_name}</td>
                    <td className="px-4 py-4 capitalize">{request.entity_type}</td>
                    <td className="px-4 py-4 text-slate-500">{new Date(request.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-4">
                      <form action={handleApprovalAction} className="flex justify-end gap-2">
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="requestId" value={request.id} />
                        <button
                          type="submit"
                          name="action"
                          value="approve"
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 transition hover:bg-emerald-100"
                        >
                          Approve
                        </button>
                        <button
                          type="submit"
                          name="action"
                          value="reject"
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700 transition hover:bg-rose-100"
                        >
                          Reject
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MasterModuleShell>
  );
}
