// app/dashboard/[workspaceId]/organizations/[organizationId]/organization-shell-layout.tsx

import React from "react";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MasterModuleWrapper } from "@/components/master-data/master-module-wrapper";
import { validateOrganizationAccess } from "@/lib/services/platform/restriction-guard";
import { getOrganizationShellContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  createOrganizationDummyData,
  deleteOrganizationDummyData,
  getOrganizationDummyDataStatus,
} from "@/lib/services/organizations/organization-dummy-data-service";
import { listActiveBusinessTypes } from "@/lib/services/platform/business-type-service";
import { requireSessionUser } from "@/lib/auth/session-manager"; // Fixed typo (removed trailing 's')
import { hasOrganizationTrialAccess, startOrganizationTrialOnFirstOpen } from "@/lib/services/platform/organization-trial-service";

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

  if (user.workspace_id !== workspaceId) {
    redirect(`/dashboard/${user.workspace_id}/home`);
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

  const activeBusinessTypesPromise = listActiveBusinessTypes();
  const organization = await getOrganizationShellContext(user.id, organizationId);

  if (!organization) {
    redirect(`/dashboard/${user.workspace_id}/home`);
  }

  if (organization.approval_status !== "APPROVED") {
    redirect(`/dashboard/${workspaceId}/home`);
  }

  await startOrganizationTrialOnFirstOpen(organization.id, user.id);
  if (!await hasOrganizationTrialAccess(organization.id)
    && !currentPath.includes("/access-blocked")
    && !currentPath.includes("/settings/pricing")) {
    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/access-blocked?message=${encodeURIComponent("Your 24-hour organization trial has ended. Activate a subscription or contact the platform administrator.")}`);
  }

  const trialOrganization = await getOrganizationShellContext(user.id, organizationId);
  if (!trialOrganization) {
    redirect(`/dashboard/${user.workspace_id}/home`);
  }

  if (currentPath === organizationPath) {
    return children;
  }

  const isOrganizationSettingsRoute =
    currentPath.startsWith(`${organizationPath}/settings`) &&
    !currentPath.startsWith(`${organizationPath}/settings/master-data`);

  // 3. Fetch and authorize the real organization before checking plan rules.
  async function createDummyDataAction() {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) {
      return { created: false, orderNo: null, orderCount: 0, error: "Workspace access denied." };
    }

    try {
      const result = await createOrganizationDummyData(actionUser.id, organizationId, actionUser.full_name || actionUser.email);
      revalidatePath(organizationPath);
      return result;
    } catch (error) {
      return {
        created: false,
        orderNo: null,
        orderCount: 0,
        error: error instanceof Error ? error.message : "Unable to create sample data.",
      };
    }
  }

  async function deleteDummyDataAction() {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) {
      return { deleted: false, error: "Workspace access denied." };
    }

    try {
      const result = await deleteOrganizationDummyData(actionUser.id, organizationId);
      revalidatePath(organizationPath);
      return result;
    } catch (error) {
      return {
        deleted: false,
        error: error instanceof Error ? error.message : "Unable to delete dummy data.",
      };
    }
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

  const [scopedRestrictions, activeBusinessTypes, dummyDataStatus] = await Promise.all([
    validateOrganizationAccess(organization, currentPath),
    activeBusinessTypesPromise,
    getOrganizationDummyDataStatus(user.id, organizationId).catch(() => ({
      status: "UNAVAILABLE",
      createdAt: null,
      orderNo: null,
      orderCount: 0,
      masterCount: 0,
    })),
  ]);

  const businessTypes = activeBusinessTypes.map((businessType) => ({
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
      trialEnabled={trialOrganization.trial_enabled}
      trialStartedAt={trialOrganization.trial_started_at?.toISOString() ?? null}
      trialEndsAt={trialOrganization.trial_ends_at?.toISOString() ?? null}
      createDummyData={createDummyDataAction}
      deleteDummyData={deleteDummyDataAction}
      dummyDataStatus={dummyDataStatus}
      businessTypes={businessTypes}
      restrictions={scopedRestrictions}
    >
      {children}
    </MasterModuleWrapper>
  );
}