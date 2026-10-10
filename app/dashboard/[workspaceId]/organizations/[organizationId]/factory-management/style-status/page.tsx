import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listFactoryStyleStatusOrders } from "@/lib/services/factory/factory-style-status-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import FactoryStyleStatusPage from "../_page-content/factory-style-status-page";

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
  const orders = await listFactoryStyleStatusOrders(user.id, organizationId);

  return <FactoryStyleStatusPage orders={orders} organizationId={organizationId} />;
}
