import { NextResponse } from "next/server";

import { testPlatformGoogleSheetsLeadConnection } from "@/lib/services/platform/platform-lead-service";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    if (typeof body.webAppUrl !== "string") throw new Error("Enter the Google Apps Script web-app URL.");
    const result = await testPlatformGoogleSheetsLeadConnection(body.webAppUrl);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save and test Google Sheets settings." },
      { status: 400 },
    );
  }
}
