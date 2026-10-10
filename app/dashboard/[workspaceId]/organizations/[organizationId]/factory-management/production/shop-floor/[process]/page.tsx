import ShopFloorProcessPage from "../_page-content/shop-floor-process-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; process: string }>;
  searchParams: Promise<{ processName?: string }>;
}) {
  const { workspaceId, organizationId, process } = await params;
  const { processName } = await searchParams;

  return (
    <ShopFloorProcessPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      processSlug={process}
      processName={processName}
    />
  );
}
