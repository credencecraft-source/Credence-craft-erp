import { renderSubSubLocationsPage } from "../../../../../../_page-content/entity-hierarchy-route-page";

export default function EntitySubLocationFolderRoute({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    moduleKey: string;
    recordCode: string;
    divisionId: string;
    locationId: string;
    subLocationId: string;
  }>;
}) {
  return renderSubSubLocationsPage(params);
}
