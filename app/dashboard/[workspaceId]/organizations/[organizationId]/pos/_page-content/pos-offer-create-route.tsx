import PosOfferCreatePage from "./pos-offer-create-page";

export default async function PosOfferCreateRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return <PosOfferCreatePage workspaceId={workspaceId} organizationId={organizationId} />;
}
