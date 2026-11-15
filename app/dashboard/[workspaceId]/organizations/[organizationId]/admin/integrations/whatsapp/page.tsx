import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

export default async function OrganizationWhatsAppIntegrationsPage({
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

  const msg91Path = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations/whatsapp/msg91`;
  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Admin / Integrations / WhatsApp</p>
          <h1 className="erp-page-heading">WhatsApp integrations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Choose a provider connection for {organization.organization_name}.
          </p>
        </div>

        <Link
          href={msg91Path}
          className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
        >
          <Card className="flex min-h-36 flex-row items-center justify-between gap-4 p-6 transition hover:border-[var(--erp-brand)] hover:shadow-md">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">MSG91 WhatsApp API</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Set this organization&apos;s MSG91 API key, namespace, and approved WhatsApp templates.
                  Credentials are encrypted and kept separate from platform settings.
                </p>
                <p className="mt-3 text-xs font-medium text-slate-500">
                  Organization-specific connection
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--erp-brand)]">
              Configure MSG91
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Card>
        </Link>
      </Section>
    </Page>
  );
}
