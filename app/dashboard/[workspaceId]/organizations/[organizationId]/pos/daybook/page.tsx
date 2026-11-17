import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

import PosDayBookPage from "../_page-content/pos-daybook-page";

export default async function PosDayBookRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_COUNTERS");

  return (
    <PosDayBookPage
      key={`${workspaceId}:${organizationId}`}
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
