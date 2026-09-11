import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { acceptOrganizationInvitation, listPendingInvitations } from "@/lib/services/organizations/organization-invitation-service";

export async function GET() {
  const user = await requireSessionUser();
  return NextResponse.json({ invitations: await listPendingInvitations(user.id) });
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    if (typeof body.token !== "string" || !body.token) return NextResponse.json({ error: "Invitation token is required." }, { status: 400 });
    await acceptOrganizationInvitation(user.id, body.token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to accept invitation." }, { status: 400 });
  }
}
