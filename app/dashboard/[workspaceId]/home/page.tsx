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
import { listOrganizationsForUser, deleteOrganization } from "@/lib/services/organizations/organization-service";
import { prisma } from "@/lib/database/prisma-client";
import { OrganizationsGrid } from "./_components/organizations-grid";
import { WorkspaceInvitationBell } from "./_components/workspace-invitation-bell";

const isDevBypass =
  process.env.NODE_ENV !== "production" && (process.env.USE_DEV_USER_STORE === "true" || !process.env.DATABASE_URL);

export default async function WorkspaceHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ success?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();
  const successMessage =
    (await searchParams)?.success === "organization-created";

  async function logoutAction() {
    "use server";
    await logoutSession();
    redirect("/");
  }

  async function deleteOrgAction(formData: FormData) {
    "use server";
    const orgId = String(formData.get("orgId") || "");
    const verificationText = String(formData.get("verificationText") || "");
    
    if (verificationText !== "DELETE") {
      return;
    }

    if (orgId) {
      try {
        await deleteOrganization(orgId, user.id);
      } catch {
        // Handle deletion error if needed
      }
    }
    redirect(`/dashboard/${workspaceId}/home`);
  }

  if (!user.workspace_id) {
    redirect("/");
  }

  let workspaceOwner: { id: string; workspace_id?: string } | null = null;

  if (isDevBypass) {
    workspaceOwner = user.workspace_id === workspaceId ? user : null;
  } else {
    try {
      workspaceOwner = await prisma.workspaceUser.findFirst({
        where: { workspace_id: workspaceId },
      });
    } catch {
      workspaceOwner = null;
    }
  }

  if (!workspaceOwner || workspaceOwner.id !== user.id) {
    notFound();
  }

  const organizations = await listOrganizationsForUser(user.id);

  return (
    <Page className="max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <Section className="space-y-6 lg:space-y-8">
        {successMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950 shadow-sm" role="status">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white"><Check className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-bold">Organization created successfully</p>
              <p className="mt-1 text-xs text-emerald-800">Your organization is ready and awaiting approval.</p>
            </div>
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
              <p className="mt-4 max-w-lg text-sm leading-6 text-emerald-50/70 sm:text-base">
                Your business operations, entities, and next decisions in one considered workspace.
              </p>
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
          <div className="relative mt-10 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50">Workspace pulse</p><p className="mt-1 text-sm font-medium text-white">{organizations.length} organization{organizations.length === 1 ? "" : "s"} connected</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50">Access level</p><p className="mt-1 text-sm font-medium text-white">Workspace owner</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/50">Account</p><p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white">{user.email_verified ? "Verified and active" : "Verification pending"} <ShieldCheck className="h-4 w-4 text-amber-300" /></p></div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><UserRound className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Profile</p><p className="mt-1 truncate text-sm font-semibold text-slate-800">{user.profile_name}</p></div></div></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Mail className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Email</p><p className="mt-1 truncate text-sm font-semibold text-slate-800" title={user.email}>{user.email}</p></div></div></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><ShieldCheck className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Security</p><p className="mt-1 text-sm font-semibold text-slate-800">{user.email_verified ? "Verified account" : "Pending verification"}</p></div></div></div>
        </div>

        <Section className="space-y-5 pt-2">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700"><Building2 className="h-3.5 w-3.5" /> Your portfolio</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-900">Organizations directory</h2>
              <p className="mt-1 text-sm text-slate-500">Select an entity to open its operational workspace.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{organizations.length} active</span>
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
              organizations={organizations} 
              workspaceId={workspaceId} 
              deleteOrgAction={deleteOrgAction} 
            />
          )}
        </Section>
        <div className="flex items-center justify-between border-t border-slate-200/70 pt-4 text-[11px] text-slate-400"><span>Credence Craft workspace</span><span className="flex items-center gap-1">Built for deliberate operations <ArrowUpRight className="h-3 w-3" /></span></div>
      </Section>
    </Page>
  );
}