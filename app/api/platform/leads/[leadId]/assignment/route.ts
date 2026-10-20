import { NextResponse } from "next/server";

import {
  assignPlatformLead,
  claimPlatformLead,
} from "@/lib/services/platform/platform-lead-service";

type RouteContext = { params: Promise<{ leadId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { leadId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const managerId = body.managerId;
    if (managerId !== null && typeof managerId !== "string") {
      return NextResponse.json({ error: "Select a valid sales manager." }, { status: 400 });
    }
    const assignment = await assignPlatformLead(leadId, managerId);
    return NextResponse.json({ assignment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to assign this lead." },
      { status: 400 },
    );
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { leadId } = await context.params;
    const lead = await claimPlatformLead(leadId);
    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to accept this lead." },
      { status: 400 },
    );
  }
}
