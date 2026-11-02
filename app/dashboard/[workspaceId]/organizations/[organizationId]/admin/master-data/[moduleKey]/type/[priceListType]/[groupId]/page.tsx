import { notFound, redirect } from "next/navigation";

import PriceListContactReport from "../../../[recordCode]/_page-content/price-list-contact-report";
import { resolvePriceListType } from "@/lib/master-data/price-list-type-resolver";
import { getPriceListRecord } from "@/lib/services/master-data/price-list-contact-service";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";

export default async function PriceListGroupPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    moduleKey: string;
    priceListType: string;
    groupId: string;
  }>;
}) {
  const { workspaceId, organizationId, moduleKey, priceListType, groupId } = await params;
  if (moduleKey !== "price-list") notFound();

  const configuredType = resolvePriceListType(priceListType);
  if (!configuredType) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUserWithPermission(user.id, organizationId, "MANAGE_MASTER_DATA");
  if (!organization) notFound();

  const group = await getPriceListRecord(organization.id, groupId);
  const metadata = group.metadata && typeof group.metadata === "object" && !Array.isArray(group.metadata)
    ? group.metadata as Record<string, unknown>
    : {};
  const groupType = typeof metadata.Channel_Type === "string"
    ? resolvePriceListType(metadata.Channel_Type)
    : null;
  if (groupType !== configuredType) notFound();

  return (
    <PriceListContactReport
      workspaceId={workspaceId}
      organizationId={organizationId}
      priceListId={group.id}
      groupName={group.label}
      priceListType={configuredType}
    />
  );
}
