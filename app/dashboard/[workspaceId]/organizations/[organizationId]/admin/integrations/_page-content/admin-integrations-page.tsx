import Link from "next/link";
import { ArrowUpRight, Fingerprint } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getEsslIntegrationData,
} from "@/lib/services/organizations/essl-biometric-integration-service";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

export default async function AdminIntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
  const integration = await getEsslIntegrationData(user.id, organizationId);

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Admin / Integrations</p>
          <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Connect this organization to external systems.
          </p>
        </div>

        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations/essl`}
          className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
        >
          <Card className="flex min-h-36 flex-row items-center justify-between gap-4 p-6 transition hover:border-[var(--erp-brand)] hover:shadow-md">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                <Fingerprint className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">ESSL Biometric Attendance</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Configure biometric machine serial numbers, entity mappings, templates, and import attendance from your existing ESSL attendance API.
                </p>
                <p className="mt-3 text-xs font-medium text-slate-500">
                  {integration.configuration.isActive ? "Enabled" : "Not enabled"}
                  {" · "}
                  {integration.machines.filter((machine) => machine.isActive).length} active machines
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--erp-brand)]">
              Open ESSL
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Card>
        </Link>
      </Section>
    </Page>
  );
}
