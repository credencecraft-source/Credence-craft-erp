import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
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
    <Page className="max-w-7xl">
      <Section className="space-y-8">
        {successMessage && (
          <div className="erp-alert erp-alert-success" role="status">
            Organization created successfully.
          </div>
        )}

        {/* Header */}
        <div className="erp-page-header">
          <div>
            <p className="erp-eyebrow">Workspace Home</p>

            <h1 className="erp-page-heading">
              Welcome back, {user.full_name}
            </h1>

            <p className="erp-page-subheading">
              Manage your organizations from a single workspace.
            </p>
          </div>

          <div className="erp-action-group">
            <WorkspaceInvitationBell />
            <Link href="/dashboard/organizations/create">
              <Button>Create Organization</Button>
            </Link>

            <Link href={`/dashboard/${workspaceId}/configuration`}>
              <Button
                variant="ghost"
                className="erp-btn-secondary-alt"
              >
                Settings
              </Button>
            </Link>

            <form action={logoutAction}>
              <Button type="submit" variant="ghost">
                Logout
              </Button>
            </form>
          </div>
        </div>

        {/* User Information */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="erp-card-p4">
            <p className="erp-card-label">Profile</p>
            <h2 className="erp-card-value">{user.profile_name}</h2>
          </Card>

          <Card className="erp-card-p4">
            <p className="erp-card-label">Email</p>
            <h2 className="erp-card-value">{user.email}</h2>
          </Card>

          <Card className="erp-card-p4">
            <p className="erp-card-label">Status</p>
            <h2 className="erp-card-value">
              {user.email_verified ? "Verified" : "Pending"}
            </h2>
          </Card>
        </div>
            
        {/* Organizations */}
        <Section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="erp-eyebrow">Organizations</p>

              <h2 className="text-2xl font-bold text-slate-900">
                Organization Directory
              </h2>
            </div>

            <Badge>{organizations.length} Active</Badge>
          </div>

          {organizations.length === 0 ? (
            <Card>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  No organizations found
                </h3>

                <p className="text-sm text-slate-600">
                  Create your first organization to begin using the ERP
                  system.
                </p>

                <Link href="/dashboard/organizations/create">
                  <Button>Create Organization</Button>
                </Link>
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
      </Section>
    </Page>
  );
}