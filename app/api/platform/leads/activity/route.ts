import { NextResponse } from "next/server";

import { listPlatformLeadActivity } from "@/lib/services/platform/platform-lead-service";

export async function GET() {
  try {
    const activity = await listPlatformLeadActivity();
    return NextResponse.json({ activity });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load lead activity." },
      { status: 400 },
    );
  }
}
