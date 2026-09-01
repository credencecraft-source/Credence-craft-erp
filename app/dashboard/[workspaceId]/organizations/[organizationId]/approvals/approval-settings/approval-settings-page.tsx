import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { listApprovalRequestsForOrganization } from "@/lib/master-data/master-data-constants";

export default async function ApprovalSettingsPage({
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

  const pendingRequests = (
    await listApprovalRequestsForOrganization(organization.id)
  ).filter((request) => request.status === "pending");

  return (
    <Page as="div">
      <Section className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="border-b border-slate-200 pb-4">
          <Badge>Approval Settings</Badge>

          <h1 className="mt-3 text-xl font-bold text-slate-900">
            Approval Settings
          </h1>

          <p className="mt-1 text-xs text-slate-500">
            Configure and monitor approval workflows for this organization.
          </p>
        </div>

        <Card className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending Requests
              </p>

              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {pendingRequests.length}
              </h2>
            </div>

            <Badge>
              {pendingRequests.length === 0 ? "Up to Date" : "Pending"}
            </Badge>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
