import { NextResponse } from "next/server";

import { createPlatformLeadSupportTicket } from "@/lib/services/organizations/support-ticket-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const ticket = await createPlatformLeadSupportTicket({
      leadId,
      subject: typeof body.subject === "string" ? body.subject : "",
      description: typeof body.description === "string" ? body.description : "",
      requestType: typeof body.requestType === "string" ? body.requestType : undefined,
      callbackDate: typeof body.callbackDate === "string" ? body.callbackDate : undefined,
      callbackTime: typeof body.callbackTime === "string" ? body.callbackTime : undefined,
    });
    return NextResponse.json({ ok: true, ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create lead support ticket." },
      { status: 400 },
    );
  }
}
