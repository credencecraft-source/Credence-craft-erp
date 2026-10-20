import { NextResponse } from "next/server";

import { listPlatformLeadStatusHistory } from "@/lib/services/platform/platform-lead-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const history = await listPlatformLeadStatusHistory(leadId);
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load lead status history." },
      { status: 400 },
    );
  }
}
