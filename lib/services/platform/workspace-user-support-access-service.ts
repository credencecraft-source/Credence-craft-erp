import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";

import {
  getPlatformSessionAdmin,
} from "@/lib/auth/platform-session-manager";
import {
  createWorkspaceSupportSessionToken,
  verifyWorkspaceSupportSessionToken,
  WORKSPACE_SUPPORT_SESSION_COOKIE_NAME,
  WORKSPACE_SUPPORT_SESSION_TTL_SECONDS,
} from "@/lib/auth/session-token";
import { prisma } from "@/lib/database/prisma-client";

const SUPPORT_ACCESS_REASON =
  "Workspace user support review initiated from the platform workspace-user report.";

export class WorkspaceUserSupportAccessError extends Error {}

export async function startWorkspaceUserSupportSession(workspaceUserId: string) {
  const admin = await getPlatformSessionAdmin();
  if (!admin || admin.actualRole !== "SUPER_ADMIN") {
    throw new WorkspaceUserSupportAccessError(
      "Only an authenticated, active Super Admin can open a workspace user account.",
    );
  }

  const normalizedUserId =
    typeof workspaceUserId === "string" ? workspaceUserId.trim() : "";
  if (!normalizedUserId) {
    throw new WorkspaceUserSupportAccessError("Workspace user ID is required.");
  }

  const cookieStore = await cookies();
  const existingSupportSessionId = verifyWorkspaceSupportSessionToken(
    cookieStore.get(WORKSPACE_SUPPORT_SESSION_COOKIE_NAME)?.value,
  );
  if (existingSupportSessionId) {
    const existingSession =
      await prisma.platformWorkspaceUserSupportSession.findFirst({
        where: {
          id: existingSupportSessionId,
          ended_at: null,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        select: { id: true },
      });
    if (existingSession) {
      throw new WorkspaceUserSupportAccessError(
        "End the current workspace user support session before opening another account.",
      );
    }
  }

  const supportSessionId = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + WORKSPACE_SUPPORT_SESSION_TTL_SECONDS * 1000,
  );

  const result = await prisma.$transaction(async (transaction) => {
    const [activeAdmin, workspaceUser, activeSupportSession] =
      await Promise.all([
        transaction.platformAdmin.findUnique({
          where: { id: admin.id },
          select: { id: true, is_active: true, role: true },
        }),
        transaction.workspaceUser.findUnique({
          where: { id: normalizedUserId },
          select: { id: true, workspace_id: true },
        }),
        transaction.platformWorkspaceUserSupportSession.findFirst({
          where: {
            platform_admin_id: admin.id,
            ended_at: null,
            revoked_at: null,
            expires_at: { gt: now },
          },
          select: { id: true },
        }),
      ]);

    if (!activeAdmin?.is_active || activeAdmin.role !== "SUPER_ADMIN") {
      throw new WorkspaceUserSupportAccessError(
        "An active Super Admin account is required.",
      );
    }
    if (!workspaceUser) {
      throw new WorkspaceUserSupportAccessError("Workspace user not found.");
    }
    if (activeSupportSession) {
      throw new WorkspaceUserSupportAccessError(
        "End the current workspace user support session before opening another account.",
      );
    }

    await transaction.platformWorkspaceUserSupportSession.create({
      data: {
        id: supportSessionId,
        platform_admin_id: admin.id,
        workspace_user_id: workspaceUser.id,
        reason: SUPPORT_ACCESS_REASON,
        expires_at: expiresAt,
      },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "WORKSPACE_USER_SUPPORT_ACCESS_STARTED",
        entity_type: "WorkspaceUser",
        entity_id: workspaceUser.id,
        details: {
          supportSessionId,
          workspaceUserId: workspaceUser.id,
          reason: SUPPORT_ACCESS_REASON,
          expiresAt: expiresAt.toISOString(),
          accessMode: "READ_ONLY",
        },
      },
    });

    return { workspaceId: workspaceUser.workspace_id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    ...result,
    token: createWorkspaceSupportSessionToken(
      supportSessionId,
      Math.floor(expiresAt.getTime() / 1000),
    ),
    expiresAt,
  };
}

export async function endWorkspaceUserSupportSession(
  supportSessionId: string | null,
) {
  if (!supportSessionId) return;

  await prisma.$transaction(async (transaction) => {
    const session =
      await transaction.platformWorkspaceUserSupportSession.findUnique({
        where: { id: supportSessionId },
        select: {
          id: true,
          platform_admin_id: true,
          workspace_user_id: true,
          ended_at: true,
        },
      });
    if (!session || session.ended_at) return;

    await transaction.platformWorkspaceUserSupportSession.update({
      where: { id: session.id },
      data: { ended_at: new Date() },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: session.platform_admin_id,
        action: "WORKSPACE_USER_SUPPORT_ACCESS_ENDED",
        entity_type: "WorkspaceUser",
        entity_id: session.workspace_user_id,
        details: { supportSessionId: session.id },
      },
    });
  });
}
