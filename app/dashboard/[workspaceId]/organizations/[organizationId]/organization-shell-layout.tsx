// app/dashboard/[workspaceId]/organizations/[organizationId]/organization-shell-layout.tsx

import React from "react";
import { MasterModuleWrapper } from "@/components/master-data/master-module-wrapper";

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

  // Mock or fetch your organization data and plan features here
  const organization = {
    organization_name: "Zoho Corporation Private Limited",
  };
  
  // Example allowed features for the active plan
  const allowedFeatures = ["order-management", "merchandising", "orders", "bom", "sales", "purchase"];

  return (
    <MasterModuleWrapper
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      allowedFeatures={allowedFeatures}
    >
      {children}
    </MasterModuleWrapper>
  );
}