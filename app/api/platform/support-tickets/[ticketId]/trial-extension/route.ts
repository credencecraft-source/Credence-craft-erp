import { NextResponse } from "next/server";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getSupportTicket } from "@/lib/services/organizations/support-ticket-service";
import {
  LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION,
  PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX,
} from "@/lib/services/organizations/trial-extension-request-constants";
import { extendOrganizationTrial } from "@/lib/services/platform/organization-trial-service";

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    await requirePlatformSessionAdmin();
    const { ticketId } = await context.params;
    const ticket = await getSupportTicket(ticketId);
    const isReviewRequest = ticket?.description.startsWith(PLATFORM_REVIEW_TRIAL_EXTENSION_DESCRIPTION_PREFIX)
      || ticket?.description === LEGACY_TRIAL_EXTENSION_REQUEST_DESCRIPTION;
    if (!ticket?.organization_id || !isReviewRequest || ticket.subject !== "Trial extension request" || !["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"].includes(ticket.status)) {
      return NextResponse.json({ error: "This ticket is not an open trial extension request." }, { status: 400 });
    }
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null ? payload as { hours?: unknown } : {};
    const hours = typeof body.hours === "number" ? body.hours : Number(body.hours);
    await extendOrganizationTrial(ticket.organization_id, hours);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to extend this trial." }, { status: 400 });
  }
}
