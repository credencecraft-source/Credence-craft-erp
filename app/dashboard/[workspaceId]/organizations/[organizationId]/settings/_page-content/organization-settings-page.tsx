import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Page from "@/components/ui/Page";
import Card from "@/components/ui/Card";
import Section from "@/components/ui/Section";
import Checkbox from "@/components/ui/Checkbox";
import Button from "@/components/ui/Button";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { setOrganizationAiEnabledByAdmin } from "@/lib/services/organizations/organization-ai-access-service";
import { ArrowLeft } from "lucide-react";

export default async function OrganizationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) redirect(`/dashboard/${user.workspace_id}/home`);
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  const membership = await requireOrganizationAccess(user.id, organization.organization_id);
  const canManageAiAccess = membership.role === "OWNER" || membership.role === "ADMIN";
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/settings`;

  async function updateAiAccess(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) redirect(`/dashboard/${actionUser.workspace_id}/home`);
    const actionOrganization = await getOrganizationForUser(actionUser.id, organizationId);
    if (!actionOrganization) redirect(`/dashboard/${workspaceId}/home`);

    const enabledValue = formData.get("enabled");
    if (enabledValue !== null && enabledValue !== "on") {
      redirect(`${base}?error=${encodeURIComponent("Invalid AI access setting.")}`);
    }

    try {
      await setOrganizationAiEnabledByAdmin(actionUser.id, actionOrganization.organization_id, enabledValue === "on");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Access denied:")) {
        redirect(`${base}?error=${encodeURIComponent("Only organization owners and administrators can change AI access.")}`);
      }
      console.error("Unable to update organization AI access.", error instanceof Error ? error.name : "Unknown error");
      redirect(`${base}?error=${encodeURIComponent("Unable to update AI access. Please try again.")}`);
    }

    revalidatePath(base);
    revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}`, "layout");
    redirect(`${base}?success=${encodeURIComponent("AI Copilot access updated.")}`);
  }

  return (
    <Page>
      <Section className="space-y-6">
        <Link
          href={`/dashboard/${workspaceId}/home`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Workspace Home
        </Link>
        <div>
          <p className="erp-eyebrow">Organization Settings</p>
          <h1 className="erp-page-heading">{organization.organization_name}</h1>
          <p className="erp-page-subheading">Manage organization access and reporting.</p>
        </div>
        <Card className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">AI Copilot</h2>
            <p className="mt-1 text-sm text-slate-600">
              Workspace owners and administrators control AI access for this organization. Existing organization permissions continue to apply. Copilot replies remain unavailable until an AI response provider is configured.
            </p>
          </div>
          {query.error && <p role="alert" className="text-sm text-[var(--erp-danger)]">{query.error}</p>}
          {query.success && <p role="status" className="text-sm text-[var(--erp-success)]">{query.success}</p>}
          {canManageAiAccess ? (
            <form action={updateAiAccess} className="flex flex-wrap items-center justify-between gap-4">
              <Checkbox
                name="enabled"
                value="on"
                defaultChecked={organization.ai_enabled}
                label={organization.ai_enabled ? "AI Copilot enabled for this organization" : "AI Copilot disabled for this organization"}
              />
              <Button type="submit" size="sm">Save AI access</Button>
            </form>
          ) : (
            <div className="space-y-2">
              <Checkbox
                checked={organization.ai_enabled}
                disabled
                readOnly
                label={organization.ai_enabled ? "AI Copilot enabled for this organization" : "AI Copilot disabled for this organization"}
              />
              <p className="text-xs text-slate-500">Only organization owners and administrators can change this setting.</p>
            </div>
          )}
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`${base}/users`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Users</h2>
              <p className="mt-2 text-sm text-slate-600">Create workspace users, invite them, and manage organization roles.</p>
            </Card>
          </Link>
          <Link href={`${base}/roles`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Roles &amp; Permissions</h2>
              <p className="mt-2 text-sm text-slate-600">Configure ERP permissions available to each organization role.</p>
            </Card>
          </Link>
          <Link href={`${base}/tax-rules`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Tax Rules</h2>
              <p className="mt-2 text-sm text-slate-600">Configure GST, VAT, and tax regimes for this organization.</p>
            </Card>
          </Link>
          <Link href={`${base}/challan-numbers`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Challan Numbers</h2>
              <p className="mt-2 text-sm text-slate-600">Centralize prefixes and starting numbers for challans, GRNs, gate entries, and related documents.</p>
            </Card>
          </Link>
          <Link href={`${base}/reports`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Reports</h2>
              <p className="mt-2 text-sm text-slate-600">Review organization reporting activity.</p>
            </Card>
          </Link>
          <Link href={`${base}/audit-history`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Audit History</h2>
              <p className="mt-2 text-sm text-slate-600">Review recorded activity across this organization.</p>
            </Card>
          </Link>
          <Link href={`${base}/pricing/plan`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Pricing &amp; Subscriptions</h2>
              <p className="mt-2 text-sm text-slate-600">Manage the organization plan.</p>
            </Card>
          </Link>
          <Link href={`${base}/usage`}>
            <Card className="transition hover:border-emerald-300">
              <h2 className="text-lg font-bold text-slate-900">Usage Statistics</h2>
              <p className="mt-2 text-sm text-slate-600">View every organization table and its current record count.</p>
            </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
