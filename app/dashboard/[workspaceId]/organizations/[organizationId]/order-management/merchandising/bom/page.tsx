import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listBomItemsPage } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import MerchandisingBomReportPage from "./_page-content/merchandising-bom-report-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();

  const organization = await requireOrganizationContext(
    user.id,
    organizationId,
  );
  const initialPage = await listBomItemsPage(organization.id, { limit: 50 });

  return (
    <MerchandisingBomReportPage
      key={organizationId}
      organizationId={organizationId}
      workspaceId={workspaceId}
      initialPage={initialPage}
    />
  );
}
