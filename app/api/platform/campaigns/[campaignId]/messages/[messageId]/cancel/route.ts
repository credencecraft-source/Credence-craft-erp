import { NextResponse } from "next/server";

import { cancelPlatformWhatsAppCampaignMessage } from "@/lib/services/platform/platform-whatsapp-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ campaignId: string; messageId: string }> },
) {
  try {
    const { campaignId, messageId } = await context.params;
    return NextResponse.json(await cancelPlatformWhatsAppCampaignMessage(campaignId, messageId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel the WhatsApp schedule.";
    return NextResponse.json(
      { error: message },
      { status: message === "WhatsApp schedule not found." ? 404 : 409 },
    );
  }
}
