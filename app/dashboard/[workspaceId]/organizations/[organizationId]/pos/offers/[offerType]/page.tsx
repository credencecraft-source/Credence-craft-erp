import { notFound } from "next/navigation";

import PosOfferTypePage from "../../_page-content/pos-offer-type-page";
import { getPosOfferTypeBySlug } from "@/lib/services/pos/pos-offer-contract";

export default async function PosOfferTypeRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; offerType: string }>;
}) {
  const { workspaceId, organizationId, offerType: offerTypeSlug } = await params;
  const offerType = getPosOfferTypeBySlug(offerTypeSlug);

  if (!offerType) notFound();

  const offersPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/offers`;
  return <PosOfferTypePage offerType={offerType} offersPath={offersPath} />;
}
