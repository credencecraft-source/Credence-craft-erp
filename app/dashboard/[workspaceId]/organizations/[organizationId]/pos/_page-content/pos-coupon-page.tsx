import Link from "next/link";

import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import PosCouponReport from "./pos-coupon-report";

export default async function PosCouponPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams?: Promise<{ created?: string | string[] }>;
}) {
  const { workspaceId, organizationId } = await params;
  const created = (await searchParams)?.created;
  const createPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/cupocode/add`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--erp-text)]">Coupon Codes</h1>
            <p className="mt-2 text-sm text-[var(--erp-text-muted)]">
              Manage general coupon codes and automatic purchase rewards.
            </p>
          </div>
          <Link href={createPath}>
            <Button type="button">Add Coupon</Button>
          </Link>
        </div>
        <PosCouponReport
          organizationId={organizationId}
          created={created === "1"}
        />
      </Section>
    </Page>
  );
}
