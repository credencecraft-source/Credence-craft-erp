import PurchaseRecordDetailPage from "../../../_page-content/purchase-record-detail-page";

export default async function PurchaseRecordRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; recordId: string }>;
}) {
  const { workspaceId, organizationId, recordId } = await params;
  return <PurchaseRecordDetailPage workspaceId={workspaceId} organizationId={organizationId} recordId={recordId} />;
}
