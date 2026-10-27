import BarcodeQrCodeTemplatesPage from "./_page-content/barcode-qr-code-templates-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const createHref = `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates/create`;

  return (
    <BarcodeQrCodeTemplatesPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      createHref={createHref}
    />
  );
}
