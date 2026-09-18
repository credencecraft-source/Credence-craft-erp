import PurchaseInvoicePage from "./_page-content/purchase-invoice-page";

export default async function PurchaseInvoiceRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <PurchaseInvoicePage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
