import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import PlatformOrganisationsPage from "./_page-content/platform-organisations-page";

export default async function PlatformOrganisationsRoute() {
  const admin = await requirePlatformSessionAdmin();
  if (
    admin.role !== "SUPER_ADMIN"
    && admin.team_role !== "CMO"
  ) {
    redirect("/platform/business-types");
  }

  return <PlatformOrganisationsPage />;
}