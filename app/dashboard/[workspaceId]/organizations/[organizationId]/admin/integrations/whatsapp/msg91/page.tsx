import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import { getOrganizationWhatsAppIntegration } from "@/lib/services/organizations/whatsapp-integration-service";
import OrganizationMsg91WhatsAppPage from "./_page-content/organization-msg91-whatsapp-page";

export default async function OrganizationMsg91WhatsAppRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
  const integration = await getOrganizationWhatsAppIntegration(user.id, organizationId);

  return (
    <OrganizationMsg91WhatsAppPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      initialSettings={integration.settings}
      initialTemplates={integration.templates}
    />
  );
}
