import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { addWorkspaceTicketMessage } from "@/lib/services/organizations/support-ticket-service";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string; ticketId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { ticketId } = await context.params;
    const body = await request.json();
    const message = await addWorkspaceTicketMessage(ticketId, user.id, typeof body.body === "string" ? body.body : "");
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send message." }, { status: 400 });
  }
}
