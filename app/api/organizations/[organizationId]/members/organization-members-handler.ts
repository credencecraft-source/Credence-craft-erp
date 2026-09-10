import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { addOrganizationMember, listOrganizationMembers, ORGANIZATION_ROLES } from "@/lib/services/organizations/organization-service";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  const user = await requireSessionUser();
  const { organizationId } = await context.params;
  // Adjusted to match the expected argument count (1 argument: organizationId)
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
    const email = typeof body.email === "string" ? body.email : "";
    const role = body.role;

    if (!email || !ORGANIZATION_ROLES.includes(role)) {
      return NextResponse.json({ error: "A valid email and organization role are required." }, { status: 400 });
    }

    // Adjusted to match the expected argument count (3 arguments: organizationId, email, role)
    const membership = await addOrganizationMember(organizationId, email, role);
    if (!membership) {
      return NextResponse.json({ error: "Organization not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add organization member.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}