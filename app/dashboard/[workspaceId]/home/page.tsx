import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { logoutSession, requireSessionUser } from "@/lib/auth/session-manager";
import { listOrganizationsForUser, deleteOrganization } from "@/lib/services/organizations/organization-service";
import { prisma } from "@/lib/database/prisma-client";

const isDevBypass =
  process.env.USE_DEV_USER_STORE === "true" || !process.env.DATABASE_URL;

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
    if (orgId) {
      try {
        await deleteOrganization(orgId, user.id);
      } catch (error) {
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
        where: {
          workspace_id: workspaceId,
        },
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
    <Page className="max-w-7xl px-4 py-8">
      <Section className="space-y-8">
        {successMessage && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm" role="status">
            <span>Organization created successfully.</span>
          </div>
        )}

        {/* Clean Modern Header */}
        <div className="flex flex-col gap-6 border-b border-slate-200/80 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-600"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Workspace Home</span>
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Welcome back, {user.full_name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage your legal entities and business operations from a single dashboard.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard/organizations/create">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                + Create Organization
              </Button>
            </Link>

            <Link href={`/dashboard/${workspaceId}/configuration`}>
              <Button
                variant="ghost"
                className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                Settings
              </Button>
            </Link>

            <form action={logoutAction}>
              <Button 
                type="submit" 
                variant="ghost" 
                className="border border-red-200 bg-red-50/50 text-red-600 hover:bg-red-100 hover:text-red-700 shadow-2xs transition-all flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </Button>
            </form>
          </div>
        </div>

        {/* Compact User Info Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Profile</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{user.profile_name}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-slate-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
          </div>

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
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Account Status</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {user.email_verified ? "Verified User" : "Pending Verification"}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
          </div>
        </div>

        {/* Organizations Section */}
        <Section className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Organizations Directory
              </h2>
              <p className="text-xs text-slate-500">Select an organization to open its module workspace.</p>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
              {organizations.length} Active
            </span>
          </div>

          {organizations.length === 0 ? (
            <Card className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
              <div className="mx-auto max-w-sm space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  No organizations found
                </h3>
                <p className="text-xs text-slate-500">
                  Create your first business profile to begin tracking inventory, orders, and payroll operations.
                </p>
                <div className="pt-2">
                  <Link href="/dashboard/organizations/create">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Create Organization</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {organizations.map((organization) => (
                <div key={organization.id} className="group relative flex flex-col justify-between rounded-lg border border-slate-200/80 bg-white p-3.5 shadow-2xs transition-all hover:border-slate-300 hover:shadow-sm">
                  <div>
                    {/* Top Row: Small Icon + Delete button */}
                    <div className="flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 font-bold text-xs shadow-2xs">
                        {organization.organization_name ? organization.organization_name.charAt(0).toUpperCase() : "O"}
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                          Active
                        </span>
                        {/* Delete Form Action */}
                        <form action={deleteOrgAction}>
                          <input type="hidden" name="orgId" value={organization.id} />
                          <button 
                            type="submit" 
                            title="Delete Organization"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </form>
                      </div>
                    </div>

                    {/* Organization details - compact */}
                    <h3 className="mt-2.5 text-sm font-semibold text-slate-900 tracking-tight truncate" title={organization.organization_name}>
                      {organization.organization_name}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      GST: {organization.gst_number || "N/A"}
                    </p>
                  </div>

                  {/* Bottom Link to open organization - compact */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <Link
                      href={`/dashboard/${workspaceId}/organizations/${organization.organization_id}`}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 w-full justify-between"
                    >
                      <span>Open Workspace</span>
                      <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </Section>
    </Page>
  );
}