import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import { resolveOnlineStoreInventoryPath } from "@/lib/services/pos/online-store-inventory-service";
import OnlineStoreInventoryDetailPage from "./online-store-inventory-detail-page";

const MANAGEMENT_ROLES = ["OWNER", "ADMIN"];

export default async function OnlineStoreInventoryDetailRoute({
  params,
  pathSegments,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
  pathSegments: string[] | Promise<string[]>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId, MANAGEMENT_ROLES);
  await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_ONLINE_STORE");
  const view = await resolveOnlineStoreInventoryPath(organization.id, await pathSegments);
  if (!view || view.level === "LOCATIONS") notFound();

  return (
    <OnlineStoreInventoryDetailPage
      view={view}
      inventoryPath={`/dashboard/${workspaceId}/organizations/${organizationId}/online/inventory`}
    />
  );
}
