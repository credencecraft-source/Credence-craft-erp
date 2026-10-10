import PurchaseBillReportPage from "../_page-content/purchase-bill-report-page";

export default async function PurchaseBillRoute({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  return <PurchaseBillReportPage workspaceId={workspaceId} organizationId={organizationId} />;
}