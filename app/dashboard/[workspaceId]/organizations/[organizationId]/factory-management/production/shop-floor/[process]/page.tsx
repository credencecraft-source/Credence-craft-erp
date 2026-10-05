import ShopFloorProcessPage from "../_page-content/shop-floor-process-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; process: string }>;
}) {
  const { workspaceId, organizationId, process } = await params;

  return (
    <ShopFloorProcessPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      processSlug={process}
    />
  );
}
