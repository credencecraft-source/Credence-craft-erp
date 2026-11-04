import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { StorageNodeError, updateStorageNode } from "@/lib/services/inventory/storage-node-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; nodeId: string }> },
) {
  let user;
  try {
    user = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let organization;
  let nodeId: string;
  try {
    const params = await context.params;
    nodeId = params.nodeId;
    organization = await requireOrganizationPermission(user.id, params.organizationId, "MANAGE_MASTER_DATA");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to verify organization access." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!isRecord(body)
    || (body.name !== undefined && typeof body.name !== "string")
    || (body.code !== undefined && typeof body.code !== "string")
    || (body.isActive !== undefined && typeof body.isActive !== "boolean")) {
    return NextResponse.json({ error: "Storage node updates are invalid." }, { status: 400 });
  }

  try {
    const node = await updateStorageNode(organization.id, user.id, nodeId, {
      ...(body.name !== undefined ? { label: body.name } : {}),
      ...(body.code !== undefined ? { fields: { node_code: body.code } } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });
    return NextResponse.json({ node });
  } catch (error) {
    if (error instanceof StorageNodeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That storage code is already in use in this organization." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update the storage node." }, { status: 500 });
  }
}
