import { notFound, redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getPlatformCampaign } from "@/lib/services/platform/platform-campaign-service";
import PlatformCampaignsPage from "../_page-content/platform-campaigns-page";

export default async function PlatformCampaignDetailRoute({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const admin = await requirePlatformSessionAdmin();
  if (
    admin.role !== "SUPER_ADMIN"
    && admin.team_role !== "CMO"
    && admin.team_role !== "SALES_MANAGER"
  ) {
    redirect("/platform/business-types");
  }

  const { campaignId } = await params;
  let campaign;
  try {
    campaign = await getPlatformCampaign(campaignId);
  } catch (error) {
    if (error instanceof Error && error.message === "Campaign not found.") notFound();
    throw error;
  }

  return (
    <PlatformCampaignsPage
      key={campaign.id}
      initialCampaign={{
        id: campaign.id,
        name: campaign.name,
        campaign_date: campaign.campaign_date.toISOString(),
        leads: campaign.leads.map(({ added_at, lead }) => ({
          added_at: added_at.toISOString(),
          lead,
        })),
      }}
    />
  );
}
