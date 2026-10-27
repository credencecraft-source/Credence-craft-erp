import BarcodeQrPrintDownloadPage from "./_page-content/barcode-qr-print-download-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return (
    <BarcodeQrPrintDownloadPage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
