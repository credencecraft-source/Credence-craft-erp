import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listLegacyManagementOrganizations } from "@/lib/services/platform/legacy-management-service";
import LegacyManagementPage from "./_page-content/legacy-management-page";

export default async function PlatformLegacyManagementRoute() {
  const admin = await requirePlatformSessionAdmin();
  if (admin.team_role !== "CTO") {
    redirect("/platform/organisations");
  }

  const organizations = await listLegacyManagementOrganizations();
  return <LegacyManagementPage organizations={organizations} />;
}
