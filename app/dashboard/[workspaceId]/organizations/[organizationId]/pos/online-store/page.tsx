import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { publishOrganizationOnlineStore } from "@/lib/services/pos/public-online-store-service";

const STORE_MANAGEMENT_ROLES = ["OWNER", "ADMIN"];

export default async function OnlineStorePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId, STORE_MANAGEMENT_ROLES);
  const publicKey = await publishOrganizationOnlineStore(organization);
  redirect(`/store/${publicKey}`);
}
