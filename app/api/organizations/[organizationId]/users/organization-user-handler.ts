import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { createStandaloneUser } from "@/lib/services/organizations/organization-invitation-service";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    await requireOrganizationAccess(user.id, organizationId, ["OWNER", "ADMIN"]);
    const body = await request.json();
    const created = await createStandaloneUser({ fullName: String(body.fullName || ""), profileName: String(body.profileName || ""), email: String(body.email || "") });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create user." }, { status: 400 });
  }
}
