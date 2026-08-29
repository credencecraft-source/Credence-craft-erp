import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/bootstrap/prisma";
import { getCurrentUser, requireOrganizationAdmin } from "../../../../lib/auth";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { organizationId } = await context.params;
    await requireOrganizationAdmin(currentUser.id, organizationId);

    const roles = await prisma.role.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ data: roles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load roles." },
      { status: error instanceof Error && error.message.includes("permission") ? 403 : 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { organizationId } = await context.params;
    await requireOrganizationAdmin(currentUser.id, organizationId);

    const body = await request.json();
    const roleName = typeof body.name === "string" ? body.name.trim() : "";
    const roleId = typeof body.id === "string" ? body.id : "";

    if (!roleName) {
      return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    }

    const modulePermissions = isPlainObject(body.modulePermissions) ? body.modulePermissions : {};
    const tablePermissions = isPlainObject(body.tablePermissions) ? body.tablePermissions : {};

    const role = roleId
      ? await prisma.role.update({
          where: { id: roleId },
          data: {
            name: roleName,
            modulePermissions: modulePermissions as Prisma.InputJsonValue,
            tablePermissions: tablePermissions as Prisma.InputJsonValue,
            canManageUsers: body.canManageUsers === true,
            canManageSubscriptions: body.canManageSubscriptions === true,
            canManageBackups: body.canManageBackups === true,
          },
        })
      : await prisma.role.create({
          data: {
            name: roleName,
            modulePermissions: modulePermissions as Prisma.InputJsonValue,
            tablePermissions: tablePermissions as Prisma.InputJsonValue,
            canManageUsers: body.canManageUsers === true,
            canManageSubscriptions: body.canManageSubscriptions === true,
            canManageBackups: body.canManageBackups === true,
            organization: {
              connect: { id: organizationId },
            },
          },
        });

    return NextResponse.json({ message: "Role saved successfully.", role }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save role." },
      { status: error instanceof Error && error.message.includes("permission") ? 403 : 500 }
    );
  }
}
