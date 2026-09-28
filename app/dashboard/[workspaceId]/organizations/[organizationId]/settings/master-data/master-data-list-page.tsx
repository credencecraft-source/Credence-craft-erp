import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";

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

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup`}
          className="block rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 transition hover:border-emerald-400 hover:bg-emerald-100"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">One-time setup</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Organization Master Setup</h2>
          <p className="mt-1 text-sm text-slate-700">Create related organization masters together.</p>
        </Link>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Master data modules, sorted alphabetically">
          {masters.map((master) => (
            <Link
              key={master.key}
              href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${master.key}`}
              className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <Card className="flex h-full min-h-32 items-start justify-between gap-4 rounded-lg border-slate-200 p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold leading-5 text-slate-900">{master.label}</h2>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{master.description}</p>
                </div>
                <ArrowUpRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-emerald-700" />
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}
