import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  Check,
  LogOut,
  Mail,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { logoutSession, requireSessionUser } from "@/lib/auth/session-manager";
import { archiveOrganization, listWorkspaceOrganizationPage, restoreOrganization } from "@/lib/services/organizations/organization-service";
import { OrganizationsGrid } from "./_components/organizations-grid";
import { WorkspaceInvitationBell } from "./_components/workspace-invitation-bell";

export default async function WorkspaceHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();
  const search = await searchParams;
  const successMessage = search?.success;
  const errorMessage = search?.error;

  async function logoutAction() {
    "use server";
    await logoutSession();
    redirect("/");
  }

  async function archiveOrgAction(formData: FormData) {
    "use server";
    const orgId = String(formData.get("orgId") || "");
    const confirmationName = String(formData.get("confirmationName") || "");

    try {
      await archiveOrganization(orgId, user.id, confirmationName);
    } catch {
      redirect(`/dashboard/${workspaceId}/home?error=organization-archive-failed`);
    }
    redirect(`/dashboard/${workspaceId}/home?success=organization-archived`);
  }

  async function restoreOrgAction(formData: FormData) {
    "use server";
    const orgId = String(formData.get("orgId") || "");

    try {
      await restoreOrganization(orgId, user.id);
    } catch {
      redirect(`/dashboard/${workspaceId}/home?error=organization-restore-failed`);
    }
    redirect(`/dashboard/${workspaceId}/home?success=organization-restored`);
  }

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const { organizations, nextCursor, totalCount, activeCount } = await listWorkspaceOrganizationPage(user.id);
  const organizationSnapshotKey = organizations
    .map((organization) => `${organization.id}:${organization.approval_status}:${organization.is_active}`)
    .join("|");

  return (
    <Page className="max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <Section className="space-y-6 lg:space-y-8">
        {successMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950 shadow-sm" role="status">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white"><Check className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-bold">{successMessage === "organization-archived" ? "Organization archived" : successMessage === "organization-restored" ? "Organization restored" : "Organization created successfully"}</p>
              <p className="mt-1 text-xs text-emerald-800">{successMessage === "organization-archived" ? "ERP records were retained and audited." : successMessage === "organization-restored" ? "The organization is active and awaiting approval." : successMessage === "organization-created-background" ? "Sample data is being prepared in the background. Your organization is awaiting platform approval." : "Your organization is ready and awaiting approval."}</p>
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
            {errorMessage === "organization-archive-failed" ? "The organization could not be archived. Confirm the exact name and make sure you are its owner." : "The organization could not be restored. Refresh and try again."}
          </div>
        )}

        <div className="relative overflow-hidden rounded-[2rem] bg-[#102a24] px-6 py-7 text-white shadow-[0_24px_70px_rgba(15,64,48,0.18)] sm:px-9 sm:py-9 lg:px-12 lg:py-11">
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border-[36px] border-emerald-300/10" />
          <div className="pointer-events-none absolute -bottom-32 right-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" /> Command center
              </div>
              <h1 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl lg:text-5xl">
                Good to see you, {user.full_name.split(" ")[0]}.
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <WorkspaceInvitationBell />
              <Link href={`/dashboard/${workspaceId}/configuration`}>
                <Button variant="ghost" className="border border-white/15 bg-white/10 text-white hover:bg-white/20">
                  <Settings2 className="h-4 w-4" /> Settings
                </Button>
              </Link>
              <Link href="/dashboard/organizations/create">
                <Button className="border-amber-300 bg-amber-300 text-[#102a24] shadow-none hover:border-amber-200 hover:bg-amber-200">
                  <Building2 className="h-4 w-4" /> New organization
                </Button>
              </Link>
              <form action={logoutAction}>
                <Button type="submit" variant="ghost" className="border border-white/10 bg-transparent text-emerald-50/70 hover:bg-white/10 hover:text-white" aria-label="Log out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
          <div className="relative mt-10 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50">Workspace pulse</p>
              <p className="mt-1 text-sm font-medium text-white">{activeCount} active · {totalCount} total</p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50"><UserRound className="h-3.5 w-3.5" /> Profile</p>
              <p className="mt-1 truncate text-sm font-medium text-white">{user.profile_name}</p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50"><Mail className="h-3.5 w-3.5" /> Email</p>
              <p className="mt-1 truncate text-sm font-medium text-white" title={user.email}>{user.email}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50">Access level</p>
              <p className="mt-1 text-sm font-medium text-white">Workspace owner</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50">Security</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white">{user.email_verified ? "Verified account" : "Pending verification"} <ShieldCheck className="h-4 w-4 text-amber-300" /></p>
            </div>
          </div>
        </div>

        <Section className="space-y-5 pt-2">
          <div className="flex justify-end">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{activeCount} active</span>
          </div>
          {organizations.length === 0 ? (
            <Card className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-none">
              <div className="mx-auto max-w-sm space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Building2 className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  No organizations found
                </h3>
                <p className="text-xs text-slate-500">
                  Create your first business profile to begin tracking inventory, orders, and payroll operations.
                </p>
                <div className="pt-2">
                  <Link href="/dashboard/organizations/create">
                    <Button className="bg-emerald-600 text-xs text-white hover:bg-emerald-700">Create organization</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <OrganizationsGrid
              key={organizationSnapshotKey}
              organizations={organizations}
              workspaceId={workspaceId}
              initialCursor={nextCursor}
              archiveOrgAction={archiveOrgAction}
              restoreOrgAction={restoreOrgAction}
            />
          )}
        </Section>
        <div className="flex items-center justify-between border-t border-slate-200/70 pt-4 text-[11px] text-slate-400"><span>Credence Craft workspace</span><span className="flex items-center gap-1">Built for deliberate operations <ArrowUpRight className="h-3 w-3" /></span></div>
      </Section>
    </Page>
  );
}