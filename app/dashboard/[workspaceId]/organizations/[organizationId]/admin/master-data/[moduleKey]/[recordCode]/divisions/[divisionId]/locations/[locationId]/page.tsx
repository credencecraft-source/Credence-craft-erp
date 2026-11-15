import { renderLocationSubLocationsPage } from "../../../../_page-content/entity-hierarchy-route-page";

export default function EntityLocationFolderRoute({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    moduleKey: string;
    recordCode: string;
    divisionId: string;
    locationId: string;
  }>;
}) {
  return renderLocationSubLocationsPage(params);
}
