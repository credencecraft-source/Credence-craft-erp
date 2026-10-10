import { NextResponse } from "next/server";

import {
  deletePlatformCampaign,
  getPlatformCampaign,
} from "@/lib/services/platform/platform-campaign-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await context.params;
    const campaign = await getPlatformCampaign(campaignId);
    return NextResponse.json({ campaign });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load campaign.";
    return NextResponse.json(
      { error: message },
      { status: message === "Campaign not found." ? 404 : 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await context.params;
    return NextResponse.json(await deletePlatformCampaign(campaignId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete campaign.";
    return NextResponse.json(
      { error: message },
      { status: message === "Campaign not found." ? 404 : 409 },
    );
  }
}
