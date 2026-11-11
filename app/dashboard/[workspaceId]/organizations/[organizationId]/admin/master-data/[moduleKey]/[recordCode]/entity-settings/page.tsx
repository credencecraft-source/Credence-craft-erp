import { notFound, redirect } from "next/navigation";

import EntitySettingsPage from "./_page-content/entity-settings-page";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";

export default async function EntitySettingsRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string; recordCode: string }>;
}) {
  const { workspaceId, organizationId, moduleKey, recordCode } = await params;
  if (moduleKey !== "entity") notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUserWithPermission(user.id, organizationId, "MANAGE_MASTER_DATA");
  if (!organization) notFound();

  const entities = await getMasterValuesForOrganization(organization.id, "entity", true, {
    search: recordCode,
    exactSearch: true,
    limit: 2,
  });
  const entity = entities.find((record) => record.id === recordCode || record.value_id === recordCode);
  if (!entity) notFound();

  return (
    <EntitySettingsPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      entityId={entity.id}
      entityName={entity.label}
    />
  );
}
