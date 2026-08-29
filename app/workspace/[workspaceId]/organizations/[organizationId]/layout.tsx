import { notFound, redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";
import { MasterModuleShell } from "@/components/master-module-shell";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect("/");
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      value="order-management"
      moduleLabel="ERP Shell"
      title="ERP System"
      description="Central Workspace"
    >
      {children}
    </MasterModuleShell>
  );
}