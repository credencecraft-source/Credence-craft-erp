import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
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

  const masters = MASTER_DEFINITIONS
    .filter((master) => !master.hidden)
    .sort((left, right) => (left.moduleOrder ?? 999) - (right.moduleOrder ?? 999));

  return (
    <Page as="div">
      <Section className="space-y-8">
        <div>
          <Badge>Master Registry</Badge>

          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            Master Modules
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Organised to follow the ERP structure used in the app. Each master sits inside the same module hierarchy used in the left sidebar, with nested groups such as Factory Management → Pre Production → Production.
          </p>
        </div>

        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup`}
          className="block rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 transition hover:border-emerald-400 hover:bg-emerald-100"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">One-time setup</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Organization Master Setup</h2>
          <p className="mt-1 text-sm text-slate-700">Create starter RM category types, categories, brands, and buyers together.</p>
        </Link>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {masters.map((master) => (
            <Link
              key={master.key}
              href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${master.key}`}
              className="group block"
            >
              <Card className="h-full px-3 py-3 transition-all duration-200 hover:border-emerald-300 hover:shadow-md">
                <h3 className="text-sm font-bold leading-tight text-slate-900">
                  {master.label}
                </h3>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700">
                    Open
                  </span>

                  <span aria-hidden="true" className="text-sm transition-transform group-hover:translate-x-1">
                    →
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
