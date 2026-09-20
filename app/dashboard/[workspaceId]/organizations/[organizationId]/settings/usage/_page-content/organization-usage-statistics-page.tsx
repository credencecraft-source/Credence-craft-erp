import Link from "next/link";
import { notFound } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { getOrganizationUsageStatistics } from "@/lib/services/organizations/organization-usage-statistics-service";
import OrganizationUsageStatisticsTable from "./organization-usage-statistics-table";

export default async function OrganizationUsageStatisticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  const usageStatistics = await getOrganizationUsageStatistics(organization.id);
  const totalRecords = usageStatistics.reduce(
    (total, statistic) => total + statistic.recordCount,
    0,
  );
  const settingsPath = `/dashboard/${workspaceId}/organizations/${organizationId}/settings`;

  return (
    <Page>
      <Section className="space-y-6">
        <div>
          <h1 className="erp-page-heading">Module Usage Statistics</h1>
          <p className="erp-page-subheading">
            {organization.organization_name} table usage and record counts.
          </p>
        </div>

        <Card>
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Organization data usage</p>
              <p className="mt-1 text-sm text-slate-600">
                Every organization-owned ERP table and its current record count.
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tables</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{usageStatistics.length}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Records</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {totalRecords.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          <OrganizationUsageStatisticsTable statistics={usageStatistics} />
        </Card>
      </Section>
    </Page>
  );
}
