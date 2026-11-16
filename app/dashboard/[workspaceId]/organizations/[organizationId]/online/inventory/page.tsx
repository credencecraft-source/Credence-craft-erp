import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import { listOrganizationOnlineStoreInventory } from "@/lib/services/pos/online-store-inventory-service";
import OnlineStoreInventoryPage from "../_page-content/online-store-inventory-page";

const MANAGEMENT_ROLES = ["OWNER", "ADMIN"];

export default async function OnlineInventoryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId, MANAGEMENT_ROLES);
  await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_ONLINE_STORE");
  const locations = await listOrganizationOnlineStoreInventory(organization.id);

  return (
    <OnlineStoreInventoryPage
      organizationId={organizationId}
      inventoryPath={`/dashboard/${workspaceId}/organizations/${organizationId}/online/inventory`}
      initialLocations={locations}
    />
  );
}
