import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

import PosCounterPage from "../_page-content/pos-counter-page";

export default async function PosCounterRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<{ created?: string | string[] }>;
}) {
  const [{ workspaceId, organizationId }, query] = await Promise.all([params, searchParams]);
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_COUNTERS");
  let canCreate = false;
  try {
    await requireOrganizationPermission(user.id, organization.id, "CREATE_POS_COUNTERS");
    canCreate = true;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("Access denied:")) {
      throw error;
    }
  }

  return (
    <PosCounterPage
      organizationId={organizationId}
      canCreate={canCreate}
      created={query.created === "1"}
    />
  );
}
