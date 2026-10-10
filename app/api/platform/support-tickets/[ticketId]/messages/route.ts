import { NextResponse } from "next/server";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { addPlatformTicketMessage } from "@/lib/services/organizations/support-ticket-service";

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const admin = await requirePlatformSessionAdmin();
    const { ticketId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null ? payload as { body?: unknown; internal?: unknown } : {};
    const message = await addPlatformTicketMessage(ticketId, admin.id, typeof body.body === "string" ? body.body : "", body.internal === true);
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send message." }, { status: 400 });
  }
}
