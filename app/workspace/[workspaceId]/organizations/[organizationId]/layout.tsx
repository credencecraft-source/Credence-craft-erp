import { ReactNode } from "react";
import { MasterModuleShell } from "@/components/master-module-shell";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName="Credence Craft"
      value="order-management"
      moduleLabel="Order Management"
      title="ERP Module"
      description="Credence Craft ERP Workspace"
    >
      {children}
    </MasterModuleShell>
  );
}