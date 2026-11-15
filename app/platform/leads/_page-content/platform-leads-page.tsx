import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  listPlatformLeadAppLogins,
  listPlatformLeads,
} from "@/lib/services/platform/platform-lead-service";
import { listPlatformSalesManagers } from "@/lib/services/platform/platform-sales-manager-service";
import PlatformLeadsWorkspace from "./platform-leads-workspace";

export default async function PlatformLeadsPage() {
  const admin = await requirePlatformSessionAdmin();
  if (
    admin.actualRole !== "SUPER_ADMIN"
    && admin.team_role !== "CMO"
    && admin.team_role !== "SALES_MANAGER"
    && !(admin.role === "ADMIN" && admin.team_role === null)
  ) {
    redirect("/platform/organisations");
  }
  const [leadRows, appLoginRows, salesManagers] = await Promise.all([
    listPlatformLeads(),
    admin.actualRole === "SUPER_ADMIN" || admin.team_role !== "SALES_MANAGER"
      ? listPlatformLeadAppLogins()
      : Promise.resolve([]),
    admin.actualRole === "SUPER_ADMIN" || admin.team_role === "CMO" || admin.team_role === null
      ? listPlatformSalesManagers()
      : Promise.resolve([]),
  ]);
  const leads = leadRows.map(({ campaignEntries, ...lead }) => ({
    ...lead,
    campaign_date: campaignEntries[0]?.campaign.campaign_date.toISOString() ?? null,
    last_campaign_date: campaignEntries[0]?.added_at.toISOString() ?? null,
    created_at: lead.created_at.toISOString(),
    updated_at: lead.updated_at.toISOString(),
    recordType: "THIRD_PARTY" as const,
  }));
  const appLogins = appLoginRows.map((user) => ({
    ...user,
    created_at: user.created_at.toISOString(),
    last_login_at: user.last_login_at?.toISOString() ?? "",
  }));

  return (
    <PlatformLeadsWorkspace
      leads={leads}
      appLogins={appLogins}
      canManageCampaigns={admin.actualRole === "SUPER_ADMIN" || admin.team_role === null}
      canManageSalesTeam={admin.actualRole === "SUPER_ADMIN" || admin.team_role === "CMO" || admin.team_role === null}
      showSalesManagerQueues={admin.team_role === "SALES_MANAGER" || admin.team_role === "CMO"}
      isSalesManager={admin.actualRole !== "SUPER_ADMIN" && admin.team_role === "SALES_MANAGER"}
      salesManagers={salesManagers.map(({ id, full_name, email, is_active }) => ({ id, full_name, email, is_active }))}
    />
  );
}
