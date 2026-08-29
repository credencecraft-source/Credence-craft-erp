import { NextRequest, NextResponse } from "next/server";
import { getBackendAdminUser } from "../../../lib/auth";
import { prisma } from "../../../lib/bootstrap/prisma";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> }
) {
  try {
    const currentUser = await getBackendAdminUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized backend admin." }, { status: 401 });
    }

    const confirm = request.headers.get("x-delete-confirm") === "true" || request.headers.get("x-confirm") === "true";
    if (!confirm) {
      return NextResponse.json({ error: "Delete confirmation is required." }, { status: 400 });
    }

    const { organizationId } = await context.params;
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.moduleAccess.deleteMany({ where: { organizationId } }),
      prisma.organizationUser.deleteMany({ where: { organizationId } }),
      prisma.role.deleteMany({ where: { organizationId } }),
      prisma.auditLog.deleteMany({ where: { organizationId } }),
      prisma.backupRecord.deleteMany({ where: { organizationId } }),
      prisma.subscription.deleteMany({ where: { organizationId } }),
      prisma.moduleDefinition.deleteMany({ where: { organizationId } }),
      prisma.orderItem.deleteMany({ where: { order: { organizationId } } }),
      prisma.order.deleteMany({ where: { organizationId } }),
      prisma.vendor.deleteMany({ where: { organizationId } }),
      prisma.tenant.deleteMany({ where: { organizationId } }),
      prisma.organization.delete({ where: { id: organizationId } }),
    ]);

    return NextResponse.json({
      message: `${organization.name} and all related records were deleted successfully.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete organization." },
      { status: 500 }
    );
  }
}
