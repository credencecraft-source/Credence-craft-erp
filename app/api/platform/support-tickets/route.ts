import { NextResponse } from "next/server";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { createPlatformSupportTicket } from "@/lib/services/organizations/support-ticket-service";

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformSessionAdmin();
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const ticket = await createPlatformSupportTicket({
      organizationId: typeof body.organizationId === "string" ? body.organizationId : "",
      submittedByUserId: typeof body.submittedByUserId === "string" ? body.submittedByUserId : "",
      platformAdminId: admin.id,
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
