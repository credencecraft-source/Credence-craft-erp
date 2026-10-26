import { NextResponse } from "next/server";

import { listPlatformLeadActivityPage } from "@/lib/services/platform/platform-lead-service";

export async function GET(request: Request) {
  try {
    const cursor = new URL(request.url).searchParams.get("cursor")?.trim();
    if (cursor !== undefined && (!cursor || cursor.length > 255)) {
      return NextResponse.json({ error: "Invalid activity cursor." }, { status: 400 });
    }
    return NextResponse.json(await listPlatformLeadActivityPage(cursor));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load lead activity." },
      { status: 400 },
    );
  }
}
