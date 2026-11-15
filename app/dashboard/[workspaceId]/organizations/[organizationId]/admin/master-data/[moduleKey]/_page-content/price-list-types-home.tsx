"use client";

import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default function PriceListTypesHome({
  workspaceId,
  organizationId,
  priceListTypes,
  records,
}: {
  workspaceId: string;
  organizationId: string;
  priceListTypes: string[];
  records: Array<{ id: string; label: string; priceListType: string | null }>;
}) {
  const router = useRouter();
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/price-list`;
  const typeCounts = new Map(priceListTypes.map((priceListType) => [
    priceListType,
    records.filter((record) => record.priceListType === priceListType).length,
  ]));

  return (
    <Page>
      <Section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--erp-muted)]">Master</p>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--erp-text)]">Price List</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Choose a price list type to view and manage its records.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`${basePath}/SETTINGS`)}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Settings
          </Button>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {priceListTypes.map((priceListType) => (
            <Button
              key={priceListType}
              type="button"
              variant="card"
              className="min-h-36 gap-3 p-6"
              onClick={() => router.push(`${basePath}/type/${encodeURIComponent(priceListType)}`)}
              aria-label={`Open ${priceListType} Price Lists`}
            >
              <span className="text-base font-semibold">{priceListType}</span>
              <span className="text-sm font-normal text-[var(--erp-muted)]">
                {typeCounts.get(priceListType) ?? 0} {typeCounts.get(priceListType) === 1 ? "record" : "records"}
              </span>
            </Button>
          ))}
        </div>

        {priceListTypes.length === 0 ? (
          <Card className="text-sm text-[var(--erp-muted)]">
            Price List Type options are not configured.
          </Card>
        ) : null}
      </Section>
    </Page>
  );
}