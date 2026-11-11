import { renderDivisionLocationsPage } from "../../_page-content/entity-hierarchy-route-page";

export default function EntityDivisionFolderRoute({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    moduleKey: string;
    recordCode: string;
    divisionId: string;
  }>;
}) {
  return renderDivisionLocationsPage(params);
}
