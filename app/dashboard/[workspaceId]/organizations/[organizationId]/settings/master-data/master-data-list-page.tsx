import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-constants";

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

  return (
    <Page as="div">
      <Section className="space-y-8">
        <div>
          <Badge>Master Registry</Badge>

          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            All Master Modules
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            This is the central registry for all ERP masters. Configure every
            master once and reuse it throughout order forms, transactions, and
            downstream modules.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MASTER_DEFINITIONS.map((master) => (
            <Link
              key={master.key}
              href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/${master.key}`}
              className="group block"
            >
              <Card className="h-full transition-all duration-200 hover:border-emerald-300 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Master
                  </p>

                  <Badge>Active</Badge>
                </div>

                <h2 className="mt-3 text-xl font-bold text-slate-900">
                  {master.label}
                </h2>

                <p className="mt-2 text-sm text-slate-600">
                  {master.description}
                </p>

                <div className="mt-6 flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-700">
                    Open Module
                  </span>

                  <span
                    aria-hidden="true"
                    className="text-lg transition-transform group-hover:translate-x-1"
                  >
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
