import { notFound, redirect } from "next/navigation";

import PriceListTypeDetail from "../../_page-content/price-list-type-detail";
import { resolvePriceListType } from "@/lib/master-data/price-list-type-resolver";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export default async function PriceListTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string; priceListType: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ workspaceId, organizationId, moduleKey, priceListType }, query] = await Promise.all([params, searchParams]);
  if (moduleKey !== "price-list") notFound();

  const configuredType = resolvePriceListType(priceListType);
  if (!configuredType) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const values = await getMasterValuesForOrganization(organization.id, "price-list", true);
  const records = values
    .filter((record) => String(record.fields.Channel_Type ?? "").toLocaleLowerCase() === configuredType.toLocaleLowerCase())
    .map((record) => ({
      id: record.id,
      label: record.label,
      code: record.code,
      isActive: record.is_active,
    }));

  return (
    <PriceListTypeDetail
      workspaceId={workspaceId}
      organizationId={organizationId}
      priceListType={configuredType}
      records={records}
      saved={query.saved}
    />
  );
}
