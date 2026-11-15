import { notFound, redirect } from "next/navigation";

import EntityDivisionsPage from "./_page-content/entity-divisions-page";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { listDivisionsForEntity } from "@/lib/services/organizations/entity-master-architecture-service";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";

export default async function EntityDivisionsRoute({
  params,
  searchParams,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    moduleKey: string;
    recordCode: string;
  }>;
  searchParams: Promise<{ saved?: string | string[] }>;
}) {
  const [{ workspaceId, organizationId, moduleKey, recordCode }, query] = await Promise.all([params, searchParams]);
  if (moduleKey !== "entity") notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUserWithPermission(
    user.id,
    organizationId,
    "MANAGE_MASTER_DATA",
  );
  if (!organization) notFound();

  const entities = await getMasterValuesForOrganization(organization.id, "entity", true, {
    search: recordCode,
    exactSearch: true,
    limit: 2,
  });
  const entity = entities.find((record) => record.id === recordCode || record.value_id === recordCode);
  if (!entity) notFound();

  const divisions = await listDivisionsForEntity(user.id, organizationId, entity.id);

  return (
    <EntityDivisionsPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      entityId={entity.id}
      entityName={entity.label}
      initialDivisions={divisions}
      profileSaved={query.saved === "update"}
    />
  );
}
