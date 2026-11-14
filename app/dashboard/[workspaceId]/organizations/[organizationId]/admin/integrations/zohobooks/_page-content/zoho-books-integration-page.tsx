import { notFound, redirect } from "next/navigation";

import FinanceIntegrationSettingsPage from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/finance-management/_page-content/finance-integration-settings-page";
import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

export default async function ZohoBooksIntegrationPage({
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
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_FINANCE_INTEGRATIONS");

  return (
    <FinanceIntegrationSettingsPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      pageTitle="Zoho Books Integration"
      backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations`}
      backLabel="Back to Integrations"
      showZohoSyncPanel
    />
  );
}
