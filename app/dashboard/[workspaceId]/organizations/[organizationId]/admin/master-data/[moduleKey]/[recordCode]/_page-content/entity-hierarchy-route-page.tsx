import { notFound, redirect } from "next/navigation";

import LocationHierarchyFolderPage from "./location-hierarchy-folder-page";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import {
  getEntityDivisionFolder,
  getEntityLocationFolder,
  getEntitySubLocationFolder,
} from "@/lib/services/organizations/entity-master-architecture-service";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";

type RouteParams = {
  workspaceId: string;
  organizationId: string;
  moduleKey: string;
  recordCode: string;
};

async function authorizeEntityRoute(params: RouteParams) {
  if (params.moduleKey !== "entity") notFound();
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== params.workspaceId) notFound();
  const organization = await getOrganizationForUserWithPermission(
    user.id,
    params.organizationId,
    "MANAGE_MASTER_DATA",
  );
  if (!organization) notFound();
  const entities = await getMasterValuesForOrganization(organization.id, "entity", true, {
    search: params.recordCode,
    exactSearch: true,
    limit: 2,
  });
  const entity = entities.find((record) => record.id === params.recordCode || record.value_id === params.recordCode);
  if (!entity) notFound();
  return { user, entity };
}

export async function renderDivisionLocationsPage(
  params: Promise<RouteParams & { divisionId: string }>,
) {
  const resolved = await params;
  const { user, entity } = await authorizeEntityRoute(resolved);
  const { division } = await getEntityDivisionFolder(
    user.id,
    resolved.organizationId,
    entity.id,
    resolved.divisionId,
  );
  return (
    <LocationHierarchyFolderPage
      workspaceId={resolved.workspaceId}
      organizationId={resolved.organizationId}
      entityId={entity.id}
      entityName={entity.label}
      divisionId={division.id}
      divisionName={division.division_name}
      level="locations"
    />
  );
}

export async function renderLocationSubLocationsPage(
  params: Promise<RouteParams & { divisionId: string; locationId: string }>,
) {
  const resolved = await params;
  const { user, entity } = await authorizeEntityRoute(resolved);
  const { division, location } = await getEntityLocationFolder(
    user.id,
    resolved.organizationId,
    entity.id,
    resolved.divisionId,
    resolved.locationId,
  );
  return (
    <LocationHierarchyFolderPage
      workspaceId={resolved.workspaceId}
      organizationId={resolved.organizationId}
      entityId={entity.id}
      entityName={entity.label}
      divisionId={division.id}
      divisionName={division.division_name}
      level="sub-locations"
      locationId={location.id}
      locationName={location.location_name}
    />
  );
}

export async function renderSubSubLocationsPage(
  params: Promise<RouteParams & { divisionId: string; locationId: string; subLocationId: string }>,
) {
  const resolved = await params;
  const { user, entity } = await authorizeEntityRoute(resolved);
  const { division, location, subLocation } = await getEntitySubLocationFolder(
    user.id,
    resolved.organizationId,
    entity.id,
    resolved.divisionId,
    resolved.locationId,
    resolved.subLocationId,
  );
  return (
    <LocationHierarchyFolderPage
      workspaceId={resolved.workspaceId}
      organizationId={resolved.organizationId}
      entityId={entity.id}
      entityName={entity.label}
      divisionId={division.id}
      divisionName={division.division_name}
      level="sub-sub-locations"
      locationId={location.id}
      locationName={location.location_name}
      subLocationId={subLocation.id}
      subLocationName={subLocation.node_name}
    />
  );
}
