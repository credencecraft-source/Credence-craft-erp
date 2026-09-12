// app/dashboard/[workspaceId]/organizations/[organizationId]/organization-shell-layout.tsx

import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MasterModuleWrapper } from "@/components/master-data/master-module-wrapper";
import { validateOrganizationAccess } from "@/lib/services/platform/restriction-guard";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { listActiveBusinessTypes } from "@/lib/services/platform/business-type-service";
import { ensureFreePlanSubscriptionsForOrganization } from "@/lib/services/platform/subscription-service";
import { requireSessionUser } from "@/lib/auth/session-manager"; // Fixed typo (removed trailing 's')
import { PendingOrganizationPrompt } from "@/components/organizations/pending-organization-prompt";

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
  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;
  const isOrganizationSettingsRoute =
    currentPath.startsWith(`${organizationPath}/settings`) &&
    !currentPath.startsWith(`${organizationPath}/settings/master-data`);

  // 3. Fetch and authorize the real organization before checking plan rules.
  const organization = await getOrganizationForUser(user.id, organizationId);
  
  if (!organization) {
    redirect(`/dashboard/${workspaceId}/home`);
  }

  if (organization.approval_status !== "APPROVED") {
    return <PendingOrganizationPrompt organizationId={organization.organization_id} />;
  }

  if (currentPath.includes("/settings")) {
    const requiredPermission = currentPath.includes("/settings/roles")
      ? "MANAGE_ROLES"
      : currentPath.includes("/settings/users")
        ? "MANAGE_USERS"
        : currentPath.includes("/settings/reports")
          ? "VIEW_REPORTS"
          : currentPath.includes("/settings/master-data")
            ? "MANAGE_MASTER_DATA"
            : "ORGANIZATION_SETTINGS";
    await requireOrganizationPermission(user.id, organizationId, requiredPermission);
  }

  await validateOrganizationAccess(organization.organization_id, currentPath);

  await ensureFreePlanSubscriptionsForOrganization(organization.id);
  const businessTypes = (await listActiveBusinessTypes()).map((businessType) => ({
    ...businessType,
    name: businessType.name.trim().toLowerCase() === "settings"
      ? "Admin"
      : businessType.name,
  }));


  if (isOrganizationSettingsRoute) {
    return children;
  }
  return (
    <MasterModuleWrapper
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      businessTypes={businessTypes}
    >
      {children}
    </MasterModuleWrapper>
  );
}