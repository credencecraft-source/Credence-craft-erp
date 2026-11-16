import OnlineStoreInventoryDetailRoute from "../../../_page-content/online-store-inventory-detail-route";

export default function OnlineInventorySubLocationPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    location: string;
    subLocation: string;
  }>;
}) {
  return OnlineStoreInventoryDetailRoute({
    params,
    pathSegments: params.then(({ location, subLocation }) => [location, subLocation]),
  });
}
