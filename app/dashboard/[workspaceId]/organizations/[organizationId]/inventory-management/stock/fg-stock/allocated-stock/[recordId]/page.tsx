import AllocatedStockDetailPage from "../../_page-content/allocated-stock-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; recordId: string }>;
}) {
  const { workspaceId, organizationId, recordId } = await params;
  return (
    <AllocatedStockDetailPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      recordId={recordId}
    />
  );
}
