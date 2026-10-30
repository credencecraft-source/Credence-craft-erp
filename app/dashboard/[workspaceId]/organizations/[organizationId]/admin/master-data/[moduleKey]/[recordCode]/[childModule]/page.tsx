import { notFound, redirect } from "next/navigation";

import PriceListContactPicker from "../_page-content/price-list-contact-picker";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getPriceListRecord } from "@/lib/services/master-data/price-list-contact-service";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export default async function PriceListChildRecordPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    moduleKey: string;
    recordCode: string;
    childModule: string;
  }>;
}) {
  const { workspaceId, organizationId, moduleKey, recordCode, childModule } = await params;
  if (moduleKey !== "price-list" || childModule !== "Price List Type") notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const priceList = await getPriceListRecord(organization.id, recordCode);
  return (
    <PriceListContactPicker
      workspaceId={workspaceId}
      organizationId={organizationId}
      priceListId={priceList.id}
    />
  );
}
