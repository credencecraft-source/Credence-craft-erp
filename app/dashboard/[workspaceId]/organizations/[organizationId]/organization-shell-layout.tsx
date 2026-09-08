// app/dashboard/[workspaceId]/organizations/[organizationId]/organization-shell-layout.tsx

import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MasterModuleWrapper } from "@/components/master-data/master-module-wrapper";
import { validateOrganizationAccess } from "@/lib/services/platform/restriction-guard";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { requireSessionUser } from "@/lib/auth/session-manager"; // Fixed typo (removed trailing 's')

type OrganizationShellLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
};

export default async function OrganizationShellLayout({
  children,
  params,
}: OrganizationShellLayoutProps) {
  const resolvedParams = await params;
  const { workspaceId, organizationId } = resolvedParams;

  // 1. Ensure user session exists
  const user = await requireSessionUser();
  if (!user) {
    redirect("/");
  }

  // 2. Get current path safely from middleware header
  const headersList = await headers();
  const rawPath =
    headersList.get("x-current-path") ||
    headersList.get("x-invoke-path") ||
    headersList.get("x-matched-path") ||
    headersList.get("x-url") ||
    "";

  // Strip domain if a full URL was captured
  const currentPath = rawPath.startsWith("http") 
    ? new URL(rawPath).pathname 
    : rawPath;

  // 3. Validate plan restriction guard (will throw or redirect if unauthorized)
  await validateOrganizationAccess(organizationId, currentPath);

  // 4. Fetch the real organization details dynamically
  const organization = await getOrganizationForUser(user.id, organizationId);
  
  if (!organization) {
    redirect(`/dashboard/${workspaceId}/home`);
  }

  return (
    <MasterModuleWrapper
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
    >
      {children}
    </MasterModuleWrapper>
  );
}