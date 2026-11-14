import FinanceSyncQueuePage from "../_page-content/finance-sync-queue-page";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export default async function FinanceSyncQueueRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.id, "DISPATCH_FINANCE_SYNC");

  return <FinanceSyncQueuePage workspaceId={workspaceId} organizationId={organizationId} />;
}
