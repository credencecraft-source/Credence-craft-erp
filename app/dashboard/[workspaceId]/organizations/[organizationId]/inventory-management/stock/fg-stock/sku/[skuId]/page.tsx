import FgSkuDetailPage from "../../_page-content/fg-sku-detail-page";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string; skuId: string }> }) {
  const { workspaceId, organizationId, skuId } = await params;
  return <FgSkuDetailPage workspaceId={workspaceId} organizationId={organizationId} skuId={skuId} />;
}