import { NextResponse } from "next/server";

import { cancelScheduledPlatformCampaignMessages } from "@/lib/services/platform/platform-campaign-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await context.params;
    return NextResponse.json(await cancelScheduledPlatformCampaignMessages(campaignId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel scheduled campaign messages.";
    return NextResponse.json(
      { error: message },
      { status: message === "Campaign not found." ? 404 : 409 },
    );
  }
}
