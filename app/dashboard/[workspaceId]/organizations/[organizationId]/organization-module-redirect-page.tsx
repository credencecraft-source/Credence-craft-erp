import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export default async function OrganizationModuleRedirectPage({
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

  // Bypass plan validation completely and route directly to order-management
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management`);
}