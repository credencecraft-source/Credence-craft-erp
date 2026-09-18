import DeliveryChallanPage from "./_page-content/delivery-challan-page";

export default async function DeliveryChallanRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <DeliveryChallanPage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
