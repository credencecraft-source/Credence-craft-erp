import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listStyleHealthOrders } from "@/lib/services/orders/style-health-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import StyleHealthPage from "./_page-content/style-health-page";

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
  const orders = await listStyleHealthOrders(user.id, organizationId);

  return <StyleHealthPage orders={orders} organizationId={organizationId} />;
}
