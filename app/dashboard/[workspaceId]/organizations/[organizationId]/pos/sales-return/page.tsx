import PosSalesReturnPage from "../_page-content/pos-sales-return-page";

export default async function SalesReturnPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return <PosSalesReturnPage workspaceId={workspaceId} organizationId={organizationId} />;
}
