import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { addWorkspaceTicketMessage } from "@/lib/services/organizations/support-ticket-service";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string; ticketId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId, ticketId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null ? payload as { body?: unknown } : {};
    const message = await addWorkspaceTicketMessage(organizationId, ticketId, user.id, typeof body.body === "string" ? body.body : "");
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send message." }, { status: 400 });
  }
}
