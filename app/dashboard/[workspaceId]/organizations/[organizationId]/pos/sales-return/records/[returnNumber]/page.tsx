import PosSalesReturnDetailPage from "../../../_page-content/pos-sales-return-detail-page";

export default async function SalesReturnRecordPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; returnNumber: string }>;
}) {
  const { workspaceId, organizationId, returnNumber } = await params;
  return (
    <PosSalesReturnDetailPage
      key={returnNumber}
      workspaceId={workspaceId}
      organizationId={organizationId}
      returnNumber={returnNumber}
    />
  );
}
