import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  listRoleMappedContacts,
  replaceRoleMappedContacts,
} from "@/lib/services/master-data/distributor-dealer-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string; roleCode: string }> },
) {
  void request;
  try {
    const user = await getSessionUser();
    if (!user?.workspace_id) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const { organizationId, contactId, roleCode } = await context.params;
    if (roleCode !== "AGENT" && roleCode !== "DEALER") {
      return NextResponse.json({ error: "Unsupported role mapping." }, { status: 400 });
    }
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    return NextResponse.json(await listRoleMappedContacts(organization.id, roleCode, contactId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load role mappings." }, { status: 400 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string; roleCode: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user?.workspace_id) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const { organizationId, contactId, roleCode } = await context.params;
    if (roleCode !== "AGENT" && roleCode !== "DEALER") {
      return NextResponse.json({ error: "Unsupported role mapping." }, { status: 400 });
    }
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const body = await request.json() as { contactIds?: unknown; commissionPercentage?: unknown };
    if (!Array.isArray(body.contactIds) || body.contactIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "Contact IDs must be provided as an array." }, { status: 400 });
    }
    const result = await replaceRoleMappedContacts(
      organization.id,
      user.id,
      roleCode,
      contactId,
      body.contactIds,
      roleCode === "AGENT" ? body.commissionPercentage as string | number | null | undefined : undefined,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save role mappings." }, { status: 400 });
  }
}
