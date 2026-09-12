import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { deleteOrganizationRole, listOrganizationRolePermissions, updateOrganizationRole } from "@/lib/services/organizations/organization-service";

export async function PATCH(request: Request, context: { params: Promise<{ organizationId: string; roleKey: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId, roleKey } = await context.params;
    const body = await request.json();
    if (typeof body.label !== "string" || !Array.isArray(body.permissions)) return NextResponse.json({ error: "A role name and permission list are required." }, { status: 400 });
    const role = await updateOrganizationRole(organizationId, user.id, roleKey, body.label, body.permissions);
    return NextResponse.json({ role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update role." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ organizationId: string; roleKey: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId, roleKey } = await context.params;
    return NextResponse.json(await deleteOrganizationRole(organizationId, user.id, roleKey));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete role." }, { status: 400 });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string; roleKey: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId, roleKey } = await context.params;
    const role = (await listOrganizationRolePermissions(organizationId, user.id)).find((item) => item.role === roleKey);
    if (!role) return NextResponse.json({ error: "The selected organization role was not found." }, { status: 404 });
    return NextResponse.json({ role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load role." }, { status: 400 });
  }
}
