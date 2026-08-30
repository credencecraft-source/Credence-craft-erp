import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function MerchandisingOrderSummaryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  const orderManagementSidebarItems = [
    {
      key: "home",
      label: "Home",
      href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management`,
    },
    {
      key: "merchandising",
      label: "Merchandising",
      href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising`,
    },
    {
      key: "purchase",
      label: "Purchase",
      href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/purchase`,
    },
  ];

  return (
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      value="order-management"
      moduleLabel="Order Management"
      title="Order Summary"
      description="Merchandising order summary."
      subItems={orderManagementSidebarItems}
    >
      <div >
        <div >
          <p >Order Summary</p>
          <h3 >Summary dashboard</h3>
          <p >This is the order summary page inside merchandising.</p>
        </div>
      </div>
    </MasterModuleShell>
  );
}
