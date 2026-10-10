import { NextResponse } from "next/server";

import {
  getPlatformWhatsAppSettings,
  savePlatformWhatsAppSettings,
} from "@/lib/services/platform/platform-whatsapp-service";

export async function GET() {
  try {
    return NextResponse.json({ settings: await getPlatformWhatsAppSettings() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load WhatsApp settings." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const settings = await savePlatformWhatsAppSettings({
      apiKey: typeof body.apiKey === "string" ? body.apiKey : "",
      namespace: typeof body.namespace === "string" ? body.namespace : "",
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save WhatsApp settings." },
      { status: 400 },
    );
  }
}
