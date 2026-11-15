import BarcodeQrCodeTemplateCreatePage from "../_page-content/barcode-qr-code-template-create-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <BarcodeQrCodeTemplateCreatePage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
