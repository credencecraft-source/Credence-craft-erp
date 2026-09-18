import PosInvoicePage from "../_page-content/pos-invoice-page";

export default async function InvoicePage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
	const { workspaceId, organizationId } = await params;
	return <PosInvoicePage workspaceId={workspaceId} organizationId={organizationId} />;
}