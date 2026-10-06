import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  listPlatformLeadAppLogins,
  listPlatformLeads,
} from "@/lib/services/platform/platform-lead-service";
import PlatformLeadsWorkspace from "./platform-leads-workspace";

export default async function PlatformLeadsPage() {
  const admin = await requirePlatformSessionAdmin();
  if (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN" && admin.team_role !== "CMO" && admin.team_role !== "CTO") {
    redirect("/platform/organisations");
  }
  const [leadRows, appLoginRows] = await Promise.all([
    listPlatformLeads(),
    listPlatformLeadAppLogins(),
  ]);
  const leads = leadRows.map((lead) => ({
    ...lead,
    created_at: lead.created_at.toISOString(),
    updated_at: lead.updated_at.toISOString(),
    recordType: "THIRD_PARTY" as const,
  }));
  const appLogins = appLoginRows.map((user) => ({
    ...user,
    last_login_at: user.last_login_at?.toISOString() ?? "",
  }));

  return (
    <PlatformLeadsWorkspace
      leads={leads}
      appLogins={appLogins}
    />
  );
}
