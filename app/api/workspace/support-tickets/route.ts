import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listSupportTicketsForUser } from "@/lib/services/organizations/support-ticket-service";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const tickets = await listSupportTicketsForUser(user.id);
    return NextResponse.json({ tickets });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load tickets." }, { status: 400 });
  }
}
