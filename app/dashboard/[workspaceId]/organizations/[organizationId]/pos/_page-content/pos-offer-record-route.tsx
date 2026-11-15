import PosOfferRecordPage from "./pos-offer-record-page";

export default async function PosOfferRecordRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; offerId: string }>;
}) {
  const { workspaceId, organizationId, offerId } = await params;
  const offersPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/offers`;

  return (
    <PosOfferRecordPage
      organizationId={organizationId}
      offerId={offerId}
      offersPath={offersPath}
    />
  );
}
