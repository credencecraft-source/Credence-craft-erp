import FinanceTransactionCreateBoundary from "../../_page-content/finance-transaction-create-boundary";

export default async function NewDeliveryChallanPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return (
    <FinanceTransactionCreateBoundary
      workspaceId={workspaceId}
      organizationId={organizationId}
      title="Delivery Challan"
      description="Delivery challans document logistics movement and carry no accounting value. They are intentionally excluded from the Finance transaction gateway; create them only in the owning logistics workflow."
    />
  );
}
