import PurchaseBillDetailPage from "../../_page-content/purchase-bill-detail-page";

export default async function PurchaseBillDetailRoute({ params }: { params: Promise<{ workspaceId: string; organizationId: string; billId: string }> }) {
  const { workspaceId, organizationId, billId } = await params;
  return <PurchaseBillDetailPage workspaceId={workspaceId} organizationId={organizationId} billId={billId} />;
}
