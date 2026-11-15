import FinanceTransactionCreateBoundary from "../../_page-content/finance-transaction-create-boundary";

export default async function NewCreditNotePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return (
    <FinanceTransactionCreateBoundary
      workspaceId={workspaceId}
      organizationId={organizationId}
      title="Create Credit Note"
      description="POS return credit notes are created from the original sales invoice. This preserves the returned quantities, tax split, stock reversal, refund settlement, and source lineage."
      sourceHref={`/dashboard/${workspaceId}/organizations/${organizationId}/pos/sales-return`}
      sourceActionLabel="Open POS sales returns"
    />
  );
}
