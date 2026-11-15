import { NextResponse } from "next/server";

import { updatePlatformLeadStage } from "@/lib/services/platform/platform-lead-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as { stage?: unknown }
      : {};
    const lead = await updatePlatformLeadStage(
      leadId,
      typeof body.stage === "string" ? body.stage : "",
    );
    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update lead stage." },
      { status: 400 },
    );
  }
}
