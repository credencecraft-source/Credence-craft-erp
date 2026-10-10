import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { getMasterDataCategory, getMastersForCategory } from "../../../settings/master-data/master-data-categories";
import DefaultMasterDataPage from "../../../settings/master-data/[moduleKey]/master-data-editor-page";

async function CategoryMasterListingPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string }>;
}) {
  const { workspaceId, organizationId, moduleKey } = await params;
  const category = getMasterDataCategory(moduleKey);

  if (!category) {
    notFound();
  }

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const masters = MASTER_DEFINITIONS.filter((master) => !master.hidden)
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  const categoryMasters = getMastersForCategory(masters, category);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data`} className="text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline">
            ← Back to master data
          </Link>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--erp-brand)]">Master data</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--erp-text)]">{category.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{category.description}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categoryMasters.map((master) => (
            <Link
              key={master.key}
              href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${master.key}`}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
            >
              <Card className="flex min-h-28 items-start justify-between gap-4 rounded-2xl p-4 transition group-hover:border-[var(--erp-brand)]">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[var(--erp-text)] group-hover:text-[var(--erp-brand)]">{master.label}</h2>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{master.description}</p>
                </div>
                <ArrowUpRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-[var(--erp-brand)]" />
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export default async function MasterDataRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { moduleKey } = await params;

  if (getMasterDataCategory(moduleKey)) {
    return <CategoryMasterListingPage params={params} />;
  }

  return <DefaultMasterDataPage params={params} searchParams={searchParams} />;
}
