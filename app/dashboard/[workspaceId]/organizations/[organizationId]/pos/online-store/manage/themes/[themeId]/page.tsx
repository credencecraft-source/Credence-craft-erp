import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { getOrganizationOnlineStorePresentation } from "@/lib/services/pos/public-online-store-service";
import PosOnlineStoreThemeEditorPage from "../../../../_page-content/pos-online-store-theme-editor-page";

const STORE_MANAGEMENT_ROLES = ["OWNER", "ADMIN"];
const AVAILABLE_THEME_IDS = ["vibrant-editorial", "fashion-atelier"] as const;

export default async function OnlineStoreThemeSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; themeId: string }>;
}) {
  const { workspaceId, organizationId, themeId } = await params;
  if (!AVAILABLE_THEME_IDS.includes(themeId as typeof AVAILABLE_THEME_IDS[number])) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId, STORE_MANAGEMENT_ROLES);
  const presentation = await getOrganizationOnlineStorePresentation(organization.id);

  return (
    <PosOnlineStoreThemeEditorPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      themeId={themeId as "vibrant-editorial" | "fashion-atelier"}
      initialPresentation={presentation}
    />
  );
}
