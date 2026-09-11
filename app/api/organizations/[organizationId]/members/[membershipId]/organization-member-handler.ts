import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { ORGANIZATION_ROLES, updateOrganizationMember } from "@/lib/services/organizations/organization-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; membershipId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, membershipId } = await context.params;
    const body = await request.json();
    const role = body.role;
    const isActive = body.isActive;

    if (!ORGANIZATION_ROLES.includes(role) || typeof isActive !== "boolean") {
      return NextResponse.json({ error: "A valid organization role and active status are required." }, { status: 400 });
    }

    // Fixed 'isActive' to 'is_active' to match expected database/service properties
    const membership = await updateOrganizationMember(membershipId, organizationId, user.id, { role, is_active: isActive });
    if (!membership) {
      return NextResponse.json({ error: "Organization member not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ membership });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update organization member.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}