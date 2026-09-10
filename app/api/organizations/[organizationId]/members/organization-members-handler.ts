import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { addOrganizationMember, listOrganizationMembers, ORGANIZATION_ROLES } from "@/lib/services/organizations/organization-service";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  const user = await requireSessionUser();
  const { organizationId } = await context.params;
  const members = await listOrganizationMembers(organizationId);

  if (!members) {
    return NextResponse.json({ error: "Organization not found or access denied." }, { status: 404 });
  }

  return NextResponse.json({ members });
}

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const body = await request.json();
    const workspaceUserId = typeof body.workspaceUserId === "string" ? body.workspaceUserId : (typeof body.userId === "string" ? body.userId : "");
    const role = body.role;

    if (!workspaceUserId || !ORGANIZATION_ROLES.includes(role)) {
      return NextResponse.json({ error: "A valid workspace user ID and organization role are required." }, { status: 400 });
    }

    const membership = await addOrganizationMember({ organizationId, workspaceUserId, role });
    if (!membership) {
      return NextResponse.json({ error: "Organization not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add organization member.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}