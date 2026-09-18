import SalesInvoicePage from "./_page-content/sales-invoice-page";

export default async function SalesInvoiceRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <SalesInvoicePage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
