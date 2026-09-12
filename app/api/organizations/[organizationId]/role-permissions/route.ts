import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { createOrganizationRole, listOrganizationRolePermissions, ORGANIZATION_PERMISSIONS, updateOrganizationRolePermissions } from "@/lib/services/organizations/organization-service";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    return NextResponse.json({ roles: await listOrganizationRolePermissions(organizationId, user.id), permissions: ORGANIZATION_PERMISSIONS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load role permissions." }, { status: 403 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const body = await request.json();
    if (typeof body.role !== "string" || !Array.isArray(body.permissions)) return NextResponse.json({ error: "A valid role and permission list are required." }, { status: 400 });
    return NextResponse.json({ role: await updateOrganizationRolePermissions(organizationId, user.id, body.role, body.permissions) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update role permissions." }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const body = await request.json();
    if (typeof body.label !== "string" || !Array.isArray(body.permissions)) return NextResponse.json({ error: "A role name and permission list are required." }, { status: 400 });
    return NextResponse.json({ role: await createOrganizationRole(organizationId, user.id, body.label, body.permissions) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create role." }, { status: 400 });
  }
}