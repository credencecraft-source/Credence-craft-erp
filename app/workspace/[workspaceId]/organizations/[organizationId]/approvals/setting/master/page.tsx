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
      <div >
        <div >
          <p >Pending approvals</p>
          <h3 >
            {pendingRequests.length === 0 ? "There is nothing to approve" : `${pendingRequests.length} records waiting for action`}
          </h3>
        </div>

        {pendingRequests.length === 0 ? (
          <div >
            <p >There is nothing to approve</p>
            <p >No pending approval requests for this organization.</p>
          </div>
        ) : (
          <div >
            <table >
              <thead >
                <tr>
                  <th >Master</th>
                  <th >Module</th>
                  <th >Type</th>
                  <th >Requested</th>
                  <th >Action</th>
                </tr>
              </thead>
              <tbody >
                {pendingRequests.map((request) => (
                  <tr key={request.id} >
                    <td >{request.entity_label}</td>
                    <td >{request.module_name}</td>
                    <td >{request.entity_type}</td>
                    <td >{new Date(request.created_at).toLocaleDateString()}</td>
                    <td >
                      <form action={handleApprovalAction} >
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="requestId" value={request.id} />
                        <button
                          type="submit"
                          name="action"
                          value="approve"
                          
                        >
                          Approve
                        </button>
                        <button
                          type="submit"
                          name="action"
                          value="reject"
                          
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
