import FinanceTransactionCreateBoundary from "../../_page-content/finance-transaction-create-boundary";

export default async function NewSalesInvoicePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return (
    <FinanceTransactionCreateBoundary
      workspaceId={workspaceId}
      organizationId={organizationId}
      title="Create Sales Invoice"
      description="Sales invoices must be created through the operational POS workflow so stock, tax, payment, and source references commit together. The resulting posted invoice appears in this Finance report."
      sourceHref={`/dashboard/${workspaceId}/organizations/${organizationId}/pos/quick-invoice`}
      sourceActionLabel="Open POS invoice workflow"
    />
  );
}
