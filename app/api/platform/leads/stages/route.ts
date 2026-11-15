import { NextResponse } from "next/server";

import {
  movePlatformLeadStages,
  updateNewPlatformLeadStages,
  updatePlatformLeadStages,
} from "@/lib/services/platform/platform-lead-service";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as { leadIds?: unknown; direction?: unknown; stage?: unknown; newLeadStage?: unknown }
      : {};
    const leadIds = Array.isArray(body.leadIds) && body.leadIds.every((id) => typeof id === "string")
      ? body.leadIds
      : [];
    if (typeof body.newLeadStage === "string") {
      const result = await updateNewPlatformLeadStages(leadIds, body.newLeadStage);
      return NextResponse.json(result);
    }
    if (typeof body.stage === "string") {
      const result = await updatePlatformLeadStages(leadIds, body.stage);
      return NextResponse.json(result);
    }
    if (body.direction !== "NEXT" && body.direction !== "PREVIOUS") {
      throw new Error("Select a valid status movement.");
    }
    const result = await movePlatformLeadStages(leadIds, body.direction);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to move lead statuses." },
      { status: 400 },
    );
  }
}
