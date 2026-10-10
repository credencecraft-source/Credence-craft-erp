import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listRawMaterialInventoryStatus } from "@/lib/services/inventory/raw-material-inventory-status-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import RawMaterialInventoryStatusPage from "../../_page-content/raw-material-inventory-status-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }

  await requireOrganizationContext(user.id, organizationId);
  const rows = await listRawMaterialInventoryStatus(user.id, organizationId);

  return <RawMaterialInventoryStatusPage rows={rows} organizationId={organizationId} />;
}
