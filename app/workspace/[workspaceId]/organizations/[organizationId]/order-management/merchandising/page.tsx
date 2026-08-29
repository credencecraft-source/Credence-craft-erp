import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function MerchandisingPage({
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
      title="Merchandising"
      description="Merchandising operations and product planning."
      subItems={orderManagementSidebarItems}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Choose a merchandising module from the tabs above to switch between Orders, Order Summary, Samples, and BOM.
        </div>
      </div>
    </MasterModuleShell>
  );
}
