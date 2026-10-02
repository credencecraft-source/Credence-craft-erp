import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requestExpiredTrialExtension } from "@/lib/services/organizations/support-ticket-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const result = await requestExpiredTrialExtension(organizationId, user.id);

    return NextResponse.json({
      ok: true,
      alreadyRequested: result.alreadyRequested,
      ticketId: result.ticket.id,
    }, { status: result.alreadyRequested ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to request a trial extension.",
    }, { status: 400 });
  }
}