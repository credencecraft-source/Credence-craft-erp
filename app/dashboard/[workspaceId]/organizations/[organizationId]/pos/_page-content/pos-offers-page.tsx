import Link from "next/link";

import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import PosOffersOverview from "./pos-offers-overview";

export default async function PosOffersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams?: Promise<{ created?: string | string[] }>;
}) {
  const { workspaceId, organizationId } = await params;
  const offersPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/offers`;
  const createdOfferCode = (await searchParams)?.created;

  return (
    <Page as="div">
      <Section>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-[var(--erp-text)]">Offers</h1>
          <Link href={`${offersPath}/create`}>
            <Button type="button">Add Offer</Button>
          </Link>
        </div>
        <PosOffersOverview
          organizationId={organizationId}
          offersPath={offersPath}
          createdOfferCode={typeof createdOfferCode === "string" ? createdOfferCode : undefined}
        />
      </Section>
    </Page>
  );
}
