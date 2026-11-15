import Link from "next/link";
import { ArrowUpRight, BookOpenCheck, Fingerprint, MessageCircle } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { listFinanceSyncQueue } from "@/lib/services/finance/central-finance-query-service";
import { getFinanceIntegrationConfig } from "@/lib/services/finance/finance-integration-service";
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
  const [integration, financeConfig, zohoQueue] = await Promise.all([
    getEsslIntegrationData(user.id, organizationId),
    getFinanceIntegrationConfig(organization.id),
    listFinanceSyncQueue({
      organizationId: organization.id,
      provider: "ZOHO_BOOKS",
      take: 1,
    }),
  ]);
  const zohoEnabled = financeConfig.activeProvider === "ZOHO_BOOKS";

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

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
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

          <Card className="flex min-h-36 flex-row items-center justify-between gap-4 p-6 opacity-80">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-surface-muted)] text-[var(--erp-text-muted)]">
                <BookOpenCheck className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">Tally Prime</h2>
                  <Badge className="border-[var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-text-muted)]">
                    Coming Soon
                  </Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Tally Prime connectivity is planned for a later release.
                </p>
                <p className="mt-3 text-xs font-medium text-slate-500">Tally will be available later</p>
              </div>
            </div>
          </Card>

          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations/zohobooks`}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
          >
            <Card className="flex min-h-36 flex-row items-center justify-between gap-4 p-6 transition hover:border-[var(--erp-brand)] hover:shadow-md">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                  <BookOpenCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">Zoho Books</h2>
                    <Badge>{zohoEnabled ? "Enabled" : "Disabled"}</Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    Synchronize approved finance transactions with Zoho Books.
                  </p>
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    {zohoQueue.count} sync record{zohoQueue.count === 1 ? "" : "s"}
                    {" · "}
                    Automatic sync {zohoEnabled && financeConfig.autoSync ? "on" : "off"}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--erp-brand)]">
                Open Zoho Books
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Card>
          </Link>

          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations/whatsapp`}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
          >
            <Card className="flex min-h-36 flex-row items-center justify-between gap-4 p-6 transition hover:border-[var(--erp-brand)] hover:shadow-md">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                  <MessageCircle className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900">WhatsApp</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    Configure this organization&apos;s MSG91 WhatsApp credentials and approved message templates.
                  </p>
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    Organization-specific settings
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--erp-brand)]">
                Open WhatsApp
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
