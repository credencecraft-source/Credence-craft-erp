import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    platformAdmin: { findUnique: vi.fn() },
    workspaceUser: { findUnique: vi.fn() },
    platformWorkspaceUserSupportSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    platformAuditEvent: { create: vi.fn() },
  };
  return {
    transaction,
    cookies: vi.fn(),
    getPlatformSessionAdmin: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      platformWorkspaceUserSupportSession: { findFirst: vi.fn() },
    },
  };
});

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  getPlatformSessionAdmin: mocks.getPlatformSessionAdmin,
}));
vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));

import {
  createWorkspaceSupportSessionToken,
  verifyWorkspaceSupportSessionToken,
  WORKSPACE_SUPPORT_SESSION_TTL_SECONDS,
} from "@/lib/auth/session-token";
import {
  endWorkspaceUserSupportSession,
  startWorkspaceUserSupportSession,
  WorkspaceUserSupportAccessError,
} from "./workspace-user-support-access-service";

const superAdmin = {
  id: "platform-admin-1",
  actualRole: "SUPER_ADMIN",
};

const workspaceUser = {
  id: "workspace-user-1",
  workspace_id: "workspace-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPlatformSessionAdmin.mockResolvedValue(superAdmin);
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (transaction: typeof mocks.transaction) => unknown) =>
      callback(mocks.transaction),
  );
  mocks.transaction.platformAdmin.findUnique.mockResolvedValue({
    id: superAdmin.id,
    is_active: true,
    role: "SUPER_ADMIN",
  });
  mocks.transaction.workspaceUser.findUnique.mockResolvedValue(workspaceUser);
  mocks.transaction.platformWorkspaceUserSupportSession.findFirst.mockResolvedValue(null);
  mocks.transaction.platformWorkspaceUserSupportSession.create.mockResolvedValue({});
  mocks.transaction.platformAuditEvent.create.mockResolvedValue({});
});

describe("workspace user support access", () => {
  it("only lets the actual Super Admin create a support session", async () => {
    mocks.getPlatformSessionAdmin.mockResolvedValue({
      ...superAdmin,
      actualRole: "ADMIN",
    });

    await expect(startWorkspaceUserSupportSession(workspaceUser.id))
      .rejects.toBeInstanceOf(WorkspaceUserSupportAccessError);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates an audited, expiring read-only session for the selected user", async () => {
    const startedAt = Date.now();
    const session = await startWorkspaceUserSupportSession(workspaceUser.id);
    expect(session.workspaceId).toBe(workspaceUser.workspace_id);
    expect(verifyWorkspaceSupportSessionToken(session.token)).toBeTruthy();
    const lifetime = session.expiresAt.getTime() - startedAt;
    expect(lifetime).toBeGreaterThanOrEqual(WORKSPACE_SUPPORT_SESSION_TTL_SECONDS * 1000);
    expect(lifetime).toBeLessThan(WORKSPACE_SUPPORT_SESSION_TTL_SECONDS * 1000 + 1000);
    expect(mocks.transaction.platformWorkspaceUserSupportSession.create)
      .toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.any(String),
          platform_admin_id: superAdmin.id,
          workspace_user_id: workspaceUser.id,
          reason: expect.stringContaining("platform workspace-user report"),
          expires_at: session.expiresAt,
        }),
      });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform_admin_id: superAdmin.id,
        action: "WORKSPACE_USER_SUPPORT_ACCESS_STARTED",
        entity_id: workspaceUser.id,
        details: expect.objectContaining({
          accessMode: "READ_ONLY",
          expiresAt: session.expiresAt.toISOString(),
        }),
      }),
    });
  });

  it("prevents opening another account while a support session is active", async () => {
    const activeToken = createWorkspaceSupportSessionToken(
      "active-support-session",
      Math.floor(Date.now() / 1000) + 60,
    );
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: activeToken }),
    });
    mocks.prisma.platformWorkspaceUserSupportSession.findFirst.mockResolvedValue({
      id: "active-support-session",
    });

    await expect(startWorkspaceUserSupportSession(workspaceUser.id))
      .rejects.toThrow("End the current workspace user support session");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("audits when a support session ends", async () => {
    mocks.transaction.platformWorkspaceUserSupportSession.findUnique.mockResolvedValue({
      id: "support-session-1",
      platform_admin_id: superAdmin.id,
      workspace_user_id: workspaceUser.id,
      ended_at: null,
    });

    await endWorkspaceUserSupportSession("support-session-1");

    expect(mocks.transaction.platformWorkspaceUserSupportSession.update)
      .toHaveBeenCalledWith({
        where: { id: "support-session-1" },
        data: { ended_at: expect.any(Date) },
      });
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith({
      data: {
        platform_admin_id: superAdmin.id,
        action: "WORKSPACE_USER_SUPPORT_ACCESS_ENDED",
        entity_type: "WorkspaceUser",
        entity_id: workspaceUser.id,
        details: { supportSessionId: "support-session-1" },
      },
    });
  });
});
