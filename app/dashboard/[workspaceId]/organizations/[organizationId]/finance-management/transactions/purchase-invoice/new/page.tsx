import PurchaseBillEntryPage from "../../../../pos/_page-content/purchase-bill-entry-page";

export default async function NewPurchaseInvoicePage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  return <PurchaseBillEntryPage workspaceId={workspaceId} organizationId={organizationId} />;
}
