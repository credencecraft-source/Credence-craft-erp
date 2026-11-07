import { PosInvoiceDetailPage } from "../../_page-content/pos-invoice-page";

export default async function PosInvoiceRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; invoiceNumber: string }>;
  searchParams: Promise<{ print?: string | string[] }>;
}) {
  const { workspaceId, organizationId, invoiceNumber } = await params;
  const { print } = await searchParams;
  return (
    <PosInvoiceDetailPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      invoiceNumber={invoiceNumber}
      initialPrintMode={print === "invoice" || print === "coupon" ? print : undefined}
    />
  );
}
