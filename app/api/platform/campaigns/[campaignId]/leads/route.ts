import { NextResponse } from "next/server";

import { addPlatformLeadsToCampaign } from "@/lib/services/platform/platform-campaign-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    if (!Array.isArray(body.leadIds) || !body.leadIds.every((leadId) => typeof leadId === "string")) {
      throw new Error("Select valid leads.");
    }
    const result = await addPlatformLeadsToCampaign(campaignId, body.leadIds);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add leads to campaign.";
    return NextResponse.json(
      { error: message },
      { status: message === "Campaign not found." ? 404 : 400 },
    );
  }
}
