import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getWorkspaceUsageStatistics } from "@/lib/services/workspace/workspace-usage-statistics-service";
import OrganizationUsageStatisticsTable from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/settings/usage/_page-content/organization-usage-statistics-table";
import { notFound } from "next/navigation";

export default async function WorkspaceUsageStatisticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const usage = await getWorkspaceUsageStatistics(user.id);

  return (
    <Page className="max-w-6xl px-0 py-0">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Workspace usage</p>
          <h1 className="erp-page-heading">ERP Usage Overview</h1>
          <p className="erp-page-subheading">
            Consolidated entity and record counts across your active organizations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organizations</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{usage.organizationCount}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ERP entities</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{usage.statistics.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total records</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {usage.totalRecords.toLocaleString("en-IN")}
            </p>
          </Card>
        </div>

        <Card>
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-base font-semibold text-slate-900">Entity usage by organization</h2>
            <p className="mt-1 text-sm text-slate-600">
              Record counts are summed across every active organization in this workspace.
            </p>
          </div>
          {usage.organizationCount === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-slate-500">
              No active organizations are available in this workspace.
            </div>
          ) : (
            <OrganizationUsageStatisticsTable statistics={usage.statistics} />
          )}
        </Card>
      </Section>
    </Page>
  );
}