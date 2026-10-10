import { NextResponse } from "next/server";

import { removePlatformLeadFromCampaign } from "@/lib/services/platform/platform-campaign-service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ campaignId: string; leadId: string }> },
) {
  try {
    const { campaignId, leadId } = await context.params;
    const result = await removePlatformLeadFromCampaign(campaignId, leadId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove lead from campaign.";
    return NextResponse.json(
      { error: message },
      { status: message === "Lead is not assigned to this campaign." ? 404 : 400 },
    );
  }
}
