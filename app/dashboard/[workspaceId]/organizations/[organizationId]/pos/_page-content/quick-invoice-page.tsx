import PosBarcodeBillingPage from "./pos-barcode-billing-page";

export default async function QuickInvoicePage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  return <PosBarcodeBillingPage workspaceId={workspaceId} organizationId={organizationId} />;
}