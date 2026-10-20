import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listPlatformSalesManagers } from "@/lib/services/platform/platform-sales-manager-service";
import PlatformSalesTeamWorkspace from "./platform-sales-team-workspace";

export default async function PlatformSalesTeamPage() {
  const admin = await requirePlatformSessionAdmin();
  if (
    admin.actualRole !== "SUPER_ADMIN"
    && admin.team_role !== "CMO"
    && !(admin.role === "ADMIN" && admin.team_role === null)
  ) {
    redirect("/platform/leads");
  }

  const managers = await listPlatformSalesManagers();
  return (
    <PlatformSalesTeamWorkspace
      managers={managers.map((manager) => ({
        ...manager,
        created_at: manager.created_at.toISOString(),
        last_login_at: manager.last_login_at?.toISOString() ?? null,
      }))}
    />
  );
}
