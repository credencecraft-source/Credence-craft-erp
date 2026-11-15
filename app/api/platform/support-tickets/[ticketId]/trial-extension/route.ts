import { NextResponse } from "next/server";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { approveOrganizationTrialExtensionRequest } from "@/lib/services/platform/organization-trial-service";

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    await requirePlatformSessionAdmin();
    const { ticketId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null ? payload as { hours?: unknown } : {};
    const hours = typeof body.hours === "number" ? body.hours : Number(body.hours);
    await approveOrganizationTrialExtensionRequest(ticketId, hours);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to extend this trial." }, { status: 400 });
  }
}
