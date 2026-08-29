import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/bootstrap/prisma";
import { getCurrentUser, requireBackupAccess } from "../../../../lib/auth";

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
    await requireBackupAccess(currentUser.id, organizationId, "view");

    const backups = await prisma.backupRecord.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: backups });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load backups.",
      },
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
    const body = await request.json();

    const action = typeof body.action === "string" ? body.action : "create";

    if (action === "restore") {
      await requireBackupAccess(currentUser.id, organizationId, "restore");

      const backupId = typeof body.backupId === "string" ? body.backupId : "";
      if (!backupId) {
        return NextResponse.json({ error: "Backup id is required for restore." }, { status: 400 });
      }

      const backup = await prisma.backupRecord.findUnique({
        where: { id: backupId },
        select: { id: true, organizationId: true, label: true },
      });

      if (!backup || backup.organizationId !== organizationId) {
        return NextResponse.json({ error: "Backup was not found for this organization." }, { status: 404 });
      }

      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: currentUser.id,
          action: "backup_restore",
          entityType: "BackupRecord",
          entityId: backup.id,
          details: { label: backup.label, restoredBy: currentUser.email },
        },
      });

      return NextResponse.json({
        message: "Backup restore initiated.",
        backup,
      });
    }

    await requireBackupAccess(currentUser.id, organizationId, "create");

    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : `Manual backup ${new Date().toISOString()}`;
    const backupType = typeof body.backupType === "string" ? body.backupType : "manual";
    const sizeInBytes = typeof body.sizeInBytes === "number" ? body.sizeInBytes : 0;

    const backup = await prisma.backupRecord.create({
      data: {
        organizationId,
        label,
        fileName: typeof body.fileName === "string" ? body.fileName : null,
        backupType,
        status: "completed",
        sizeInBytes,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: currentUser.id,
        action: "backup_created",
        entityType: "BackupRecord",
        entityId: backup.id,
        details: { label, backupType, sizeInBytes },
      },
    });

    return NextResponse.json(
      {
        message: "Backup created successfully.",
        backup,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to process backup request.",
      },
      { status: error instanceof Error && error.message.includes("permission") ? 403 : 500 }
    );
  }
}
