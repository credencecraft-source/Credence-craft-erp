import OnlineStoreInventoryDetailRoute from "../../_page-content/online-store-inventory-detail-route";

export default function OnlineInventoryLocationPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    location: string;
  }>;
}) {
  return OnlineStoreInventoryDetailRoute({
    params,
    pathSegments: params.then(({ location }) => [location]),
  });
}
