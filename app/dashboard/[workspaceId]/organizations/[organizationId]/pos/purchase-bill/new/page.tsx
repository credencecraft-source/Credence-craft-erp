import PurchaseBillEntryPage from "../../_page-content/purchase-bill-entry-page";

export default async function NewPurchaseBillRoute({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  return <PurchaseBillEntryPage workspaceId={workspaceId} organizationId={organizationId} />;
}