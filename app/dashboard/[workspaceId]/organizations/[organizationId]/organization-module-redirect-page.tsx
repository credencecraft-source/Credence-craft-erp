import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { getSubscriptionsByOrganization } from "@/lib/services/platform/subscription-service";

export default async function OrganizationModuleRedirectPage({
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

  const subscriptions = await getSubscriptionsByOrganization(organizationId);
  
  // 1. Filter only active subscriptions
  const today = new Date().toISOString().split("T")[0];
  const activeSubscriptions = (subscriptions || []).filter((sub: any) => {
    const isDateValid = sub.endDate && sub.endDate >= today;
    const isPaid = sub.paymentStatus === "paid";
    return isDateValid && isPaid;
  });

  // 2. Determine the best route to redirect to based on active subscriptions
  let redirectPath = "settings"; // Safe fallback if no active plan

  if (activeSubscriptions.length > 0) {
    const firstActiveSub = activeSubscriptions[0];
    if (firstActiveSub.businessTypeName) {
      // Formats "Order Management" to "order-management"
      redirectPath = firstActiveSub.businessTypeName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    } else {
      redirectPath = "order-management";
    }
  }

  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/${redirectPath}`);
}