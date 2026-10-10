import { notFound, redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  getPlatformCampaign,
} from "@/lib/services/platform/platform-campaign-service";
import { listPlatformWhatsAppCampaignMessages } from "@/lib/services/platform/platform-whatsapp-service";
import PlatformWhatsAppSendHistoryPage from "./_page-content/platform-whatsapp-send-history-page";

export default async function PlatformWhatsAppSendHistoryRoute({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const admin = await requirePlatformSessionAdmin();
  if (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN" && admin.team_role !== "CMO") {
    redirect("/platform/organisations");
  }

  const { campaignId } = await params;
  let campaign;
  try {
    campaign = await getPlatformCampaign(campaignId);
  } catch (error) {
    if (error instanceof Error && error.message === "Campaign not found.") notFound();
    throw error;
  }
  const messages = await listPlatformWhatsAppCampaignMessages(campaignId);

  return (
    <PlatformWhatsAppSendHistoryPage
      campaignId={campaign.id}
      campaignName={campaign.name}
      messages={messages.map((message) => ({
        ...message,
        scheduled_at: message.scheduled_at.toISOString(),
        submitted_at: message.submitted_at?.toISOString() ?? null,
        recipients: message.recipients.map((recipient) => ({
          ...recipient,
          delivered_at: recipient.delivered_at?.toISOString() ?? null,
        })),
      }))}
    />
  );
}
