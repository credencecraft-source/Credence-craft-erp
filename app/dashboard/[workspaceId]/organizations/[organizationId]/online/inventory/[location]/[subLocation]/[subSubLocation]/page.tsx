import OnlineStoreInventoryDetailRoute from "../../../../_page-content/online-store-inventory-detail-route";

export default function OnlineInventorySubSubLocationPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    location: string;
    subLocation: string;
    subSubLocation: string;
  }>;
}) {
  return OnlineStoreInventoryDetailRoute({
    params,
    pathSegments: params.then(({ location, subLocation, subSubLocation }) => [
      location,
      subLocation,
      subSubLocation,
    ]),
  });
}
