import { ReactNode } from "react";
import { notFound } from "next/navigation";

import { MasterModuleShell } from "@/components/master-data/master-module-wrapper";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { listActiveBusinessTypes } from "@/lib/services/platform/business-type-service";

export default async function OrganizationShellLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  
  const [organization, businessTypes] = await Promise.all([
    getOrganizationForUser(user.id, organizationId),
    listActiveBusinessTypes(),
  ]);

  if (!organization) {
    notFound();
  }

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      businessTypes={businessTypes}
    >
      {children}
    </MasterModuleShell>
  );
}