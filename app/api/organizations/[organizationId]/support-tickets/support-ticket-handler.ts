import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { createSupportTicket } from "@/lib/services/organizations/support-ticket-service";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const body = await request.json();
    const ticket = await createSupportTicket({
      organizationId,
      submittedByUserId: user.id,
      subject: typeof body.subject === "string" ? body.subject : "",
      description: typeof body.description === "string" ? body.description : "",
      priority: typeof body.priority === "string" ? body.priority : undefined,
      requestType: typeof body.requestType === "string" ? body.requestType : undefined,
      callbackDate: typeof body.callbackDate === "string" ? body.callbackDate : undefined,
      callbackTime: typeof body.callbackTime === "string" ? body.callbackTime : undefined,
    });

    return NextResponse.json({ ok: true, ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create support ticket." }, { status: 400 });
  }
}
