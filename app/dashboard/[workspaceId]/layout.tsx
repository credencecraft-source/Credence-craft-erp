import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { hasOrganizationsForUser } from "@/lib/services/organizations/organization-service";
import WorkspaceUserSupportAccessBanner from "@/components/auth/workspace-user-support-access-banner";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }

  if (!await hasOrganizationsForUser(user.id)) {
    redirect("/dashboard/organizations/create");
  }

  return (
    <div className="erp-workspace-shell h-dvh w-full max-w-full overflow-hidden">
      <div className="h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
        {user.supportAccess && (
          <WorkspaceUserSupportAccessBanner
            workspaceId={workspaceId}
            supportAccess={user.supportAccess}
          />
        )}
        {children}
      </div>
    </div>
  );
}