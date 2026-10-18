import { PosInvoiceDetailPage } from "../../_page-content/pos-invoice-page";

export default async function PosInvoiceRecordPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; invoiceNumber: string }>;
}) {
  const { workspaceId, organizationId, invoiceNumber } = await params;
  return (
    <PosInvoiceDetailPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      invoiceNumber={invoiceNumber}
    />
  );
}
