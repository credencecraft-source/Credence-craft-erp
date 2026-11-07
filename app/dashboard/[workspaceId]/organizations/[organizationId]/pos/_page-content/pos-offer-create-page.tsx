import PosOfferManager from "./pos-offer-manager";

export default function PosOfferCreatePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const offersPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/offers`;

  return (
    <PosOfferManager
      organizationId={organizationId}
      createOnly
      offersPath={offersPath}
    />
  );
}
