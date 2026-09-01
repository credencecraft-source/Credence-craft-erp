import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { listApprovalRequestsForOrganization, updateApprovalRequestStatus } from "@/lib/master-data/master-data-constants";

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

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/approvals/approval-settings/master-review`);
}

export default async function ApprovalMasterReviewPage({
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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending approvals</p>
          <h3 className="text-xl font-bold text-slate-900">
            {pendingRequests.length === 0 ? "There is nothing to approve" : `${pendingRequests.length} records waiting for action`}
          </h3>
        </div>
      </div>

      {pendingRequests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm space-y-2">
          <p className="text-sm font-bold text-slate-900">There is nothing to approve</p>
          <p className="text-xs text-slate-500">No pending approval requests for this organization.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3">Master</th>
                <th className="p-3">Module</th>
                <th className="p-3">Type</th>
                <th className="p-3">Requested</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingRequests.map((request) => (
                <tr key={request.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-medium text-slate-900">{request.entity_label}</td>
                  <td className="p-3 text-slate-600">{request.module_name}</td>
                  <td className="p-3 text-slate-600">{request.entity_type}</td>
                  <td className="p-3 text-slate-600">{new Date(request.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <form action={handleApprovalAction} className="inline-flex items-center gap-2">
                      <input type="hidden" name="workspaceId" value={workspaceId} />
                      <input type="hidden" name="organizationId" value={organizationId} />
                      <input type="hidden" name="requestId" value={request.id} />
                      <button
                        type="submit"
                        name="action"
                        value="approve"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 transition"
                      >
                        Approve
                      </button>
                      <button
                        type="submit"
                        name="action"
                        value="reject"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
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
  );
}
