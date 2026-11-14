import FinanceProcurementVendorBillCreatePage from "../../_page-content/finance-procurement-vendor-bill-create-page";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export default async function FinanceProcurementVendorBillCreateRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.id, "CREATE_PROCUREMENT_VENDOR_BILL");

  return <FinanceProcurementVendorBillCreatePage workspaceId={workspaceId} organizationId={organizationId} />;
}
