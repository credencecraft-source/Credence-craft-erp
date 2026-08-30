import { ReactNode } from "react";
import { MasterModuleShell } from "@/components/master-module-shell";

export default function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { workspaceId: string; organizationId: string };
}) {
  return (
    <MasterModuleShell
      workspaceId={params.workspaceId}
      organizationId={params.organizationId}
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