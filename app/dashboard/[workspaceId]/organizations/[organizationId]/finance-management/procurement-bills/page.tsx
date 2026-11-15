import FinanceProcurementVendorBillsPage from "../_page-content/finance-procurement-vendor-bills-page";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";

export default async function FinanceProcurementVendorBillsRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  await requireFinanceOrganizationAccess(user.id, organizationId);

  return <FinanceProcurementVendorBillsPage workspaceId={workspaceId} organizationId={organizationId} />;
}
