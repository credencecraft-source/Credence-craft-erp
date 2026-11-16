import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  getPosCounterById,
  getPosCounterIdFromRouteKey,
} from "@/lib/services/pos/pos-counter-service";

import PosDayBookCounterDetailPage from "../../../_page-content/pos-daybook-counter-detail-page";

export default async function PosDayBookCounterRoute({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    counterType: string;
    counterKey: string;
  }>;
}) {
  const { workspaceId, organizationId, counterType, counterKey } = await params;
  if (counterType !== "COUNTER") notFound();

  const counterId = getPosCounterIdFromRouteKey(counterKey);
  if (!counterId) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_COUNTERS");
  await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_SALES");

  const counter = await getPosCounterById(organization.id, counterId);
  if (!counter) notFound();
  if (counter.routeKey !== counterKey) {
    redirect(
      `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/pos/daybook/COUNTER/${encodeURIComponent(counter.routeKey)}`,
    );
  }

  return (
    <PosDayBookCounterDetailPage
      counter={counter}
      dayBookHref={`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/pos/daybook`}
      organizationId={organization.organizationId}
    />
  );
}
