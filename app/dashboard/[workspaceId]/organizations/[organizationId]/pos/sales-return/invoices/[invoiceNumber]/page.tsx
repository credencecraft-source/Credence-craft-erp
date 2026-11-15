import PosSalesReturnInvoicePage from "../../../_page-content/pos-sales-return-invoice-page";

export default async function SalesReturnInvoicePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; invoiceNumber: string }>;
}) {
  const { workspaceId, organizationId, invoiceNumber } = await params;
  return (
    <PosSalesReturnInvoicePage
      key={invoiceNumber}
      workspaceId={workspaceId}
      organizationId={organizationId}
      invoiceNumber={invoiceNumber}
    />
  );
}
