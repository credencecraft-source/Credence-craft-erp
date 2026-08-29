import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";
import { listApprovalRequestsForOrganization } from "@/lib/master-data";

export default async function ApprovalSettingPage({
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

  const pendingRequests = (await listApprovalRequestsForOrganization(organization.id)).filter(
    (request) => request.status === "pending",
  );

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      value="approvals"
      moduleLabel="Approvals"
      title="Setting"
      description="Approval setting options."
      subItems={[
        {
          key: "masters",
          label: "Masters",
          href: `/workspace/${workspaceId}/organizations/${organizationId}/approvals/setting/master`,
          count: pendingRequests.length,
        },
      ]}
    >
      <div className="space-y-5" />
    </MasterModuleShell>
  );
}
