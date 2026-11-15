import { NextResponse } from "next/server";

import { rotatePlatformWhatsAppDeliveryToken } from "@/lib/services/platform/platform-whatsapp-service";

export async function POST() {
  try {
    return NextResponse.json(await rotatePlatformWhatsAppDeliveryToken());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the delivery callback token." },
      { status: 400 },
    );
  }
}
