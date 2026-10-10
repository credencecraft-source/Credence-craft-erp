import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";
import { MASTER_DATA_CATEGORIES, getMastersForCategory } from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/settings/master-data/master-data-categories";

export default async function MasterDataListPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(
    user.id,
    organizationId,
  );

  if (!organization) {
    notFound();
  }

  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const masters = MASTER_DEFINITIONS
    .filter((master) => !master.hidden)
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));

  const masterGroups = MASTER_DATA_CATEGORIES.map((category) => ({
    ...category,
    masters: getMastersForCategory(masters, category),
  }));

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup`}
          className="inline-flex rounded-lg text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
        >
          Organization Master Setup — create related masters together
        </Link>

        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Master data categories">
          {masterGroups.map((group) => (
            <Link
              key={group.id}
              href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${group.routeSegment}`}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
            >
              <Card className="flex min-h-40 flex-col justify-between gap-4 rounded-2xl p-5 transition group-hover:border-[var(--erp-brand)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--erp-brand)]">Master data</p>
                    <h2 className="mt-2 text-xl font-semibold text-[var(--erp-text)]">{group.title}</h2>
                  </div>
                  <ArrowUpRight aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-[var(--erp-brand)]" />
                </div>

                <p className="text-sm leading-6 text-slate-600">{group.description}</p>

                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                  <span className="rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-2.5 py-1">
                    {group.masters.length} masters
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}
