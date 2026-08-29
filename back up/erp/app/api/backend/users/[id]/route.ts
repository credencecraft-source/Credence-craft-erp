import { NextRequest, NextResponse } from "next/server";
import { getBackendAdminUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/bootstrap/prisma";

async function deleteWorkspaceUser(userId: string) {
  const relatedOrganizationCount = await prisma.organization.count({
    where: {
      OR: [{ createdBy: userId }, { memberships: { some: { userId } } }],
    },
  });

  if (relatedOrganizationCount > 0) {
    throw new Error("Delete all related organizations before deleting this workspace user.");
  }

  await prisma.$transaction([
    prisma.moduleAccess.deleteMany({ where: { userId } }),
    prisma.organizationUser.deleteMany({ where: { userId } }),
    prisma.auditLog.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

async function deletePlatformAdmin(userId: string) {
  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { createdBy: userId },
        { memberships: { some: { userId } } },
      ],
    },
    select: { id: true },
  });

  const organizationIds = organizations.map((organization) => organization.id);
  const workspaces = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });

  const workspaceIds = workspaces.map((workspace) => workspace.id);

  await prisma.$transaction([
    prisma.moduleAccess.deleteMany({ where: { userId } }),
    prisma.organizationUser.deleteMany({
      where: {
        OR: [
          { userId },
          ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
        ],
      },
    }),
    prisma.role.deleteMany({
      where: {
        organizationId: organizationIds.length ? { in: organizationIds } : undefined,
      },
    }),
    prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId },
          ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
        ],
      },
    }),
    prisma.backupRecord.deleteMany({ where: { organizationId: organizationIds.length ? { in: organizationIds } : undefined } }),
    prisma.subscription.deleteMany({ where: { organizationId: organizationIds.length ? { in: organizationIds } : undefined } }),
    prisma.moduleDefinition.deleteMany({ where: { organizationId: organizationIds.length ? { in: organizationIds } : undefined } }),
    prisma.tenant.deleteMany({ where: { organizationId: organizationIds.length ? { in: organizationIds } : undefined } }),
    prisma.vendor.deleteMany({ where: { organizationId: organizationIds.length ? { in: organizationIds } : undefined } }),
    prisma.order.deleteMany({ where: { organizationId: organizationIds.length ? { in: organizationIds } : undefined } }),
    prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
    prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getBackendAdminUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized backend admin." }, { status: 401 });
    }

    const { id } = await params;
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isPlatformAdmin: true,
        isActive: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const confirm = request.headers.get("x-delete-confirm") === "true" || request.headers.get("x-confirm") === "true";
    if (!confirm) {
      return NextResponse.json({ error: "Delete confirmation is required." }, { status: 400 });
    }

    const relatedOrganizationCount = await prisma.organization.count({
      where: {
        OR: [{ createdBy: targetUser.id }, { memberships: { some: { userId: targetUser.id } } }],
      },
    });

    if (relatedOrganizationCount > 0) {
      return NextResponse.json({
        error: "Workspace user cannot be deleted while it is linked to an organization.",
      }, { status: 409 });
    }

    try {
      await deleteWorkspaceUser(targetUser.id);
      return NextResponse.json({ message: "Workspace user deleted successfully." });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to delete workspace user." },
        { status: 409 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete user." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getBackendAdminUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized backend admin." }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action === "activate" ? "activate" : "deactivate";

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isPlatformAdmin: true, isActive: true, name: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const authUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, isPlatformAdmin: true, isActive: true },
    });

    if (!authUser || !authUser.isActive || !authUser.isPlatformAdmin) {
      return NextResponse.json({ error: "Only active platform admins can manage user status from the backend panel." }, { status: 403 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: action === "activate" },
      select: { id: true, name: true, isActive: true },
    });

    return NextResponse.json({
      message: action === "activate" ? "User activated successfully." : "User deactivated successfully.",
      user: updated,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update user status." },
      { status: 500 }
    );
  }
}
