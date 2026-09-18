import FinanceTransactionsPage from "./_page-content/finance-transactions-page";

export default async function FinanceTransactionsRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <FinanceTransactionsPage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
