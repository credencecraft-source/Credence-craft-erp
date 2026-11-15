import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

type PageSetupPermission = "VIEW_REPORTS" | "MANAGE_MASTER_DATA";

export async function requirePageSetupTemplatePageAccess(
  workspaceId: string,
  organizationId: string,
  permission: PageSetupPermission,
) {
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.organizationId, permission);
  return { user, organization };
}

export async function canManagePageSetupTemplates(userId: string, publicOrganizationId: string) {
  try {
    await requireOrganizationPermission(userId, publicOrganizationId, "MANAGE_MASTER_DATA");
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) return false;
    throw error;
  }
}
