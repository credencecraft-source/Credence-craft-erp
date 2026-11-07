import { notFound } from "next/navigation";

import { PosOfferScopePage } from "../../../_page-content/pos-offer-type-page";
import {
  getPosOfferScopeBySlug,
  getPosOfferTypeBySlug,
} from "@/lib/services/pos/pos-offer-contract";

export default async function PosOfferScopeRoute({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    offerType: string;
    offerScope: string;
  }>;
}) {
  const {
    organizationId,
    offerType: offerTypeSlug,
    offerScope: offerScopeSlug,
  } = await params;
  const offerType = getPosOfferTypeBySlug(offerTypeSlug);
  const scope = getPosOfferScopeBySlug(offerScopeSlug);

  if (!offerType || !scope) notFound();

  return <PosOfferScopePage organizationId={organizationId} offerType={offerType} scope={scope} />;
}
