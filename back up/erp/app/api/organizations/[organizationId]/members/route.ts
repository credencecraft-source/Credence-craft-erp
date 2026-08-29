import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/bootstrap/prisma";
import { getCurrentUser, requireOrganizationAdmin } from "../../../../lib/auth";

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

    const memberships = await prisma.organizationUser.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            isPlatformAdmin: true,
          },
        },
        role: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      data: memberships.map((membership) => ({
        id: membership.id,
        userId: membership.userId,
        organizationId: membership.organizationId,
        isOwner: membership.isOwner,
        roleId: membership.roleId,
        role: membership.role,
        user: membership.user,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load organization members." },
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
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const requestedRoleName = typeof body.roleName === "string" ? body.roleName.trim() : "Admin";
    const isOwner = body.isOwner === true;

    if (!email) {
      return NextResponse.json({ error: "User email is required." }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: name || undefined,
      },
      create: {
        name: name || "Organization User",
        email,
      },
    });

    const role = await prisma.role.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: requestedRoleName,
        },
      },
      update: {
        canManageUsers: requestedRoleName.toLowerCase().includes("admin"),
      },
      create: {
        organizationId,
        name: requestedRoleName,
        isSuperAdmin: requestedRoleName.toLowerCase() === "super admin",
        canManageUsers: true,
        canManageSubscriptions: requestedRoleName.toLowerCase().includes("admin"),
        canManageBackups: requestedRoleName.toLowerCase().includes("admin"),
      },
    });

    const membership = await prisma.organizationUser.upsert({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
      update: {
        roleId: role.id,
        isOwner,
      },
      create: {
        organizationId,
        userId: user.id,
        roleId: role.id,
        isOwner,
      },
    });

    return NextResponse.json({
      message: "Organization member saved successfully.",
      membership,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save organization member." },
      { status: error instanceof Error && error.message.includes("permission") ? 403 : 500 }
    );
  }
}
