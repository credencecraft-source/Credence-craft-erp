import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { logoutSession, requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { listOrganizationsForUser } from "@/lib/services/organizations/organization-service";

const isDevBypass = process.env.USE_DEV_USER_STORE === "true" || !process.env.DATABASE_URL;

export default async function WorkspaceConfigurationPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();
  const successMessage = (await searchParams)?.success === "profile-updated";
  const errorMessage = (await searchParams)?.error;

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
  const hasOrganizations = organizations.length > 0;

  async function logoutAction() {
    "use server";
    await logoutSession();
    redirect("/");
  }

  async function updateProfileAction(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") || "").trim();
    const profileName = String(formData.get("profileName") || "").trim();

    if (!fullName || !profileName) {
      redirect(`/dashboard/${workspaceId}/configuration`);
    }

    await prisma.workspaceUser.update({
      where: { id: user.id },
      data: {
        full_name: fullName,
        profile_name: profileName,
      },
    });

    revalidatePath(`/dashboard/${workspaceId}/configuration`);
    redirect(`/dashboard/${workspaceId}/configuration?success=profile-updated`);
  }

  async function deleteWorkspaceAction() {
    "use server";
    try {
      const activeOrgs = await listOrganizationsForUser(user.id);
      if (activeOrgs.length > 0) {
        redirect(`/dashboard/${workspaceId}/configuration?error=has-organizations`);
      }

      if (!isDevBypass) {
        await prisma.workspaceUser.delete({
          where: { id: user.id },
        });
      }

      await logoutSession();
      redirect("/");
    } catch (err) {
      redirect(`/dashboard/${workspaceId}/configuration?error=deletion-failed`);
    }
  }

  return (
    <Page className="max-w-4xl px-4 py-8">
      <Section className="space-y-6">
        {successMessage && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-xs" role="status">
            <span>Profile settings updated successfully.</span>
          </div>
        )}

        {errorMessage === "has-organizations" && (
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-xs" role="status">
            <span>Please delete all your active organizations from the workspace home before deleting the workspace.</span>
          </div>
        )}

        {errorMessage === "deletion-failed" && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-xs" role="status">
            <span>Failed to delete workspace. Please try again.</span>
          </div>
        )}

        {/* Clean Modern Header */}
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-600"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Workspace Settings</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Account & Workspace Details
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Manage your profile preferences and workspace configuration.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href={`/dashboard/${workspaceId}/home`}>
              <Button
                variant="ghost"
                className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs h-9"
              >
                ← Back to Workspace
              </Button>
            </Link>

            <form action={logoutAction}>
              <Button 
                type="submit" 
                variant="ghost" 
                className="border border-red-200 bg-red-50/50 text-red-600 hover:bg-red-100 hover:text-red-700 shadow-2xs text-xs h-9 flex items-center gap-1.5 transition-all"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </Button>
            </form>
          </div>
        </div>

        {/* Profile Update Form Card */}
        <Card className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">Personal Information</h2>
            <p className="text-xs text-slate-500">Update your display name and profile identity.</p>
          </div>

          <form action={updateProfileAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700" htmlFor="fullName">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  defaultValue={user.full_name}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700" htmlFor="profileName">
                  Profile Name
                </label>
                <input
                  id="profileName"
                  name="profileName"
                  defaultValue={user.profile_name}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-xs">
                Save Changes
              </Button>
            </div>
          </form>
        </Card>

        {/* Account Metadata Cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <div className="overflow-hidden">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Email Address</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={user.email}>{user.email}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-slate-500 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Last Login</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Not available"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-slate-500 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
        </div>

        {/* Danger Zone: Requires manual organization deletion first */}
        <Card className="rounded-xl border border-red-200/60 bg-red-50/20 p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-red-900">Delete Workspace</h2>
              <p className="text-xs text-slate-600 max-w-xl">
                {hasOrganizations
                  ? `You currently have ${organizations.length} active organization(s). Please delete them from your workspace home before deleting the workspace.`
                  : "All organizations have been removed. You can now safely delete your workspace."}
              </p>
            </div>
            
            <form action={deleteWorkspaceAction}>
              <Button
                type="submit"
                className={`border text-xs shrink-0 shadow-xs ${
                  hasOrganizations
                    ? "border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100"
                    : "border-red-300 bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                Delete Workspace
              </Button>
            </form>
          </div>
        </Card>
      </Section>
    </Page>
  );
}