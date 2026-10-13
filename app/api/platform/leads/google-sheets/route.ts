import { NextResponse } from "next/server";

import { syncPlatformLeadsFromGoogleSheet } from "@/lib/services/platform/platform-lead-service";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    if (typeof body.webAppUrl !== "string") {
      throw new Error("Enter the Google Apps Script web-app URL in Google Sheets settings.");
    }
    const result = await syncPlatformLeadsFromGoogleSheet(body.webAppUrl);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync Google Sheets leads." },
      { status: 400 },
    );
  }
}
