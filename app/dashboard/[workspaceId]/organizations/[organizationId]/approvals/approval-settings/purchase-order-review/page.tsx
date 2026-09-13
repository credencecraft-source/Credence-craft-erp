import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { listApprovalRequestsForOrganization, updateApprovalRequestStatus } from "@/lib/master-data/master-data-constants";

async function handlePurchaseOrderApproval(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const action = String(formData.get("action") ?? "approve");
  const user = await requireSessionUser();
  if (!workspaceId || !organizationId || !requestId) return;
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "APPROVER"]);
  const request = (await listApprovalRequestsForOrganization(organization.id)).find((entry) => entry.id === requestId || entry.request_id === requestId);
  if (!request || request.entity_type !== "purchase-order") return;
  await updateApprovalRequestStatus(organization.id, request.request_id || request.id, action === "approve" ? "approved" : "rejected", user.full_name || user.email);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/approvals/approval-settings/purchase-order-review`);
}

export default async function PurchaseOrderApprovalPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "APPROVER"]);
  const pendingRequests = (await listApprovalRequestsForOrganization(organization.id)).filter((request) => request.status === "pending" && request.entity_type === "purchase-order");

  return <div className="mx-auto max-w-7xl space-y-6 p-6"><header className="border-b border-slate-200 pb-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Approvals / Purchase Order</p><h1 className="mt-1 text-xl font-bold text-slate-900">Purchase Order Approval</h1><p className="mt-1 text-xs text-slate-500">Review Purchase Orders submitted from Procurement.</p></header>{pendingRequests.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><p className="text-sm font-bold text-slate-900">There are no Purchase Orders waiting for approval.</p></div> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr><th className="p-3">Purchase Order</th><th className="p-3">Requested by</th><th className="p-3">Requested date</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{pendingRequests.map((request) => <tr key={request.id}><td className="p-3 font-semibold text-slate-900">{request.entity_label}</td><td className="p-3 text-slate-600">{request.requested_by ?? "-"}</td><td className="p-3 text-slate-600">{new Date(request.created_at).toLocaleDateString()}</td><td className="p-3 text-right"><form action={handlePurchaseOrderApproval} className="inline-flex gap-2"><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="requestId" value={request.id} /><button type="submit" name="action" value="approve" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button><button type="submit" name="action" value="reject" className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Reject</button></form></td></tr>)}</tbody></table></div>}</div>;
}