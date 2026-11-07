import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import {
  POS_OFFER_SCOPE_OPTIONS,
  type PosOfferScopeOption,
  type PosOfferTypeOption,
} from "@/lib/services/pos/pos-offer-contract";
import PosOfferManager from "./pos-offer-manager";

export default function PosOfferTypePage({
  offerType,
  offersPath,
}: {
  offerType: PosOfferTypeOption;
  offersPath: string;
}) {
  return (
    <Page as="div">
      <Section>
        <h1 className="text-3xl font-bold text-[var(--erp-text)]">{offerType.label}</h1>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {POS_OFFER_SCOPE_OPTIONS.map((scope) => (
            <Link
              key={scope.slug}
              href={`${offersPath}/${offerType.slug}/${scope.slug}`}
              className="block h-full"
            >
              <Card className="h-full transition-colors hover:border-[var(--erp-brand)]">
                <h2 className="text-lg font-semibold text-[var(--erp-text)]">{scope.label}</h2>
                <p className="mt-2 text-sm text-[var(--erp-muted)]">{scope.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export function PosOfferScopePage({
  organizationId,
  offerType,
  scope,
}: {
  organizationId: string;
  offerType: PosOfferTypeOption;
  scope: PosOfferScopeOption;
}) {
  return (
    <PosOfferManager
      key={`${offerType.slug}:${scope.slug}`}
      organizationId={organizationId}
      offerType={offerType}
      scope={scope}
    />
  );
}
