import { NextResponse } from "next/server";

import {
  createPlatformCampaign,
  listPlatformCampaigns,
} from "@/lib/services/platform/platform-campaign-service";

export async function GET() {
  try {
    const campaigns = await listPlatformCampaigns();
    return NextResponse.json({ campaigns });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load campaigns." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const campaign = await createPlatformCampaign({
      name: typeof body.name === "string" ? body.name : "",
      campaignDate: typeof body.campaignDate === "string" ? body.campaignDate : "",
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create campaign." },
      { status: 400 },
    );
  }
}
