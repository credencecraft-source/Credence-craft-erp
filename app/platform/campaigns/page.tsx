import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listPlatformCampaigns } from "@/lib/services/platform/platform-campaign-service";
import PlatformCampaignsPage from "./_page-content/platform-campaigns-page";

export default async function PlatformCampaignsRoute() {
  const admin = await requirePlatformSessionAdmin();
  if (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN" && admin.team_role !== "CMO" && admin.team_role !== "CTO") {
    redirect("/platform/organisations");
  }

  const campaigns = await listPlatformCampaigns();
  return (
    <PlatformCampaignsPage
      campaigns={campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        campaign_date: campaign.campaign_date.toISOString(),
        created_at: campaign.created_at.toISOString(),
        lead_count: campaign._count.leads,
        can_cancel: campaign.can_cancel,
        can_delete: campaign.can_delete,
        action_block_reason: campaign.action_block_reason,
      }))}
    />
  );
}
