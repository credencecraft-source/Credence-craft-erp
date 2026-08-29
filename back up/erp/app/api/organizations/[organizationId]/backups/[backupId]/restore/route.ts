import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/bootstrap/prisma";
import { getCurrentUser, requireBackupAccess } from "../../../../../../lib/auth";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ organizationId: string; backupId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { organizationId, backupId } = await context.params;
    await requireBackupAccess(currentUser.id, organizationId, "restore");

    const backup = await prisma.backupRecord.findUnique({
      where: { id: backupId },
      select: { id: true, organizationId: true, label: true, status: true },
    });

    if (!backup || backup.organizationId !== organizationId) {
      return NextResponse.json({ error: "Backup was not found for this organization." }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: currentUser.id,
        action: "backup_restore_requested",
        entityType: "BackupRecord",
        entityId: backup.id,
        details: { label: backup.label, status: backup.status },
      },
    });

    return NextResponse.json({
      message: "Restore request accepted for approval.",
      backup,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to restore backup.",
      },
      { status: error instanceof Error && error.message.includes("permission") ? 403 : 500 }
    );
  }
}
