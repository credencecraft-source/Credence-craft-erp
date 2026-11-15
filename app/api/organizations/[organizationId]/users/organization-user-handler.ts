import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { createStandaloneUser } from "@/lib/services/organizations/organization-invitation-service";
import { requireOrganizationAccess, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    await requireOrganizationAccess(user.id, organizationId, ["OWNER", "ADMIN"]);
    await requireOrganizationPermission(user.id, organizationId, "MANAGE_USERS");
    const body = await request.json();
    const created = await createStandaloneUser({ fullName: String(body.fullName || ""), profileName: String(body.profileName || ""), email: String(body.email || "") });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create user.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
  }
}
