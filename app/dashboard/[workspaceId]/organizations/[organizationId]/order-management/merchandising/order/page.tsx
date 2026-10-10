import MerchandisingOrdersPage from "./_page-content/merchandising-order-list-page";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { listOrdersPage } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

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
    undefined,
    { allowExpiredTrial: true },
  );
  const initialPage = await listOrdersPage(organization.id, { limit: 25, status: "Draft" });

  return (
    <MerchandisingOrdersPage
      key={organizationId}
      workspaceId={workspaceId}
      organizationId={organizationId}
      initialPage={initialPage}
    />
  );
}
