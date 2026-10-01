import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { countOrganizationsForUser } from "@/lib/services/organizations/organization-service";

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
    notFound();
  }

  if (await countOrganizationsForUser(user.id) === 0) {
    redirect("/dashboard/organizations/create");
  }

  return children;
}