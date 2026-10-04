import { NextResponse } from "next/server";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { updateSupportTicketStatus } from "@/lib/services/organizations/support-ticket-service";

export async function PATCH(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const admin = await requirePlatformSessionAdmin();
    const { ticketId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null ? payload as { status?: unknown } : {};
    const ticket = await updateSupportTicketStatus(ticketId, typeof body.status === "string" ? body.status : "", admin.id);
    return NextResponse.json({ ok: true, ticket });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update ticket status." }, { status: 400 });
  }
}
