import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { dispatchDuePlatformWhatsAppCampaignMessages } from "@/lib/services/platform/platform-whatsapp-service";

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await dispatchDuePlatformWhatsAppCampaignMessages();
    return NextResponse.json({ dispatched: result.dispatched });
  } catch (error) {
    console.error("Platform WhatsApp campaign worker failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to process scheduled WhatsApp messages." },
      { status: 500 },
    );
  }
}
