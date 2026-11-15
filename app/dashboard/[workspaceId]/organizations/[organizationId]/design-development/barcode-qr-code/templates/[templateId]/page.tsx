import BarcodeQrCodeTemplateDetailPage from "../_page-content/barcode-qr-code-template-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; templateId: string }>;
}) {
  const { workspaceId, organizationId, templateId } = await params;
  return (
    <BarcodeQrCodeTemplateDetailPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      templateId={templateId}
    />
  );
}
