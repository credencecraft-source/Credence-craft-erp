import { NextResponse } from "next/server";

import {
  listPlatformWhatsAppCampaignMessages,
  schedulePlatformWhatsAppCampaignMessage,
} from "@/lib/services/platform/platform-whatsapp-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await context.params;
    return NextResponse.json({ messages: await listPlatformWhatsAppCampaignMessages(campaignId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load campaign messages." },
      { status: 400 },
    );
  }
}

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
    if (typeof body.templateId !== "string" || typeof body.scheduledAt !== "string" || body.consentConfirmed !== true) {
      throw new Error("Choose a template, schedule time, and confirm recipient consent.");
    }
    const message = await schedulePlatformWhatsAppCampaignMessage({
      campaignId,
      templateId: body.templateId,
      scheduledAt: body.scheduledAt,
      consentConfirmed: true,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to schedule campaign message." },
      { status: 400 },
    );
  }
}
