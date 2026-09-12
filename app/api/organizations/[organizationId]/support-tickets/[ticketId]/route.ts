import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getSupportTicket } from "@/lib/services/organizations/support-ticket-service";

export async function GET(request: Request, context: { params: Promise<{ organizationId: string; ticketId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId, ticketId } = await context.params;
    const ticket = await getSupportTicket(ticketId);
    if (!ticket || ticket.organization.organization_id !== organizationId || ticket.submittedBy.id !== user.id) {
      return NextResponse.json({ error: "Support ticket not found." }, { status: 404 });
    }
    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load support ticket." }, { status: 400 });
  }
}
