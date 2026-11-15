import FinanceTransactionCreateBoundary from "../../_page-content/finance-transaction-create-boundary";

export default async function NewDebitNotePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return (
    <FinanceTransactionCreateBoundary
      workspaceId={workspaceId}
      organizationId={organizationId}
      title="Create Debit Note"
      description="A supplier debit note requires an authorized procurement return workflow, which is not yet available. No placeholder document is created here; the Finance report only shows supported, persisted transactions."
    />
  );
}
