import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { createOrganizationInvitation, listOrganizationInvitations } from "@/lib/services/organizations/organization-invitation-service";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  const user = await requireSessionUser();
  const { organizationId } = await context.params;
  return NextResponse.json({ invitations: await listOrganizationInvitations(organizationId, user.id) });
}

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const body = await request.json();
    if (typeof body.inviteeUserId !== "string" || typeof body.role !== "string") return NextResponse.json({ error: "A user and valid organization role are required." }, { status: 400 });
    const invitation = await createOrganizationInvitation({ organizationId, inviteeUserId: body.inviteeUserId, role: body.role, invitedByUserId: user.id });
    const origin = new URL(request.url).origin;
    return NextResponse.json({ invitation, inviteUrl: `${origin}/dashboard/invitations/${invitation.token}` }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create invitation." }, { status: 400 });
  }
}
