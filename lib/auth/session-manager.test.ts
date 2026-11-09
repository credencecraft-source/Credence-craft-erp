import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  supportSessionFindUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("react", () => ({ cache: (callback: unknown) => callback }));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    platformWorkspaceUserSupportSession: {
      findUnique: mocks.supportSessionFindUnique,
    },
    workspaceUser: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/dev/dev-user-store-mock", () => ({ getDevUserById: vi.fn() }));

import {
  createWorkspaceSupportSessionToken,
  WORKSPACE_SUPPORT_SESSION_COOKIE_NAME,
} from "@/lib/auth/session-token";
import { getSessionUser } from "./session-manager";

const now = new Date("2026-11-09T00:00:00.000Z");
const supportSessionId = "support-session-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({
    get: (name: string) =>
      name === WORKSPACE_SUPPORT_SESSION_COOKIE_NAME
        ? {
            value: createWorkspaceSupportSessionToken(
              supportSessionId,
              Math.floor(Date.now() / 1000) + 60,
            ),
          }
        : undefined,
  });
  mocks.supportSessionFindUnique.mockResolvedValue({
    id: supportSessionId,
    ended_at: null,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000),
    reason: "Support review",
    platformAdmin: {
      full_name: "Support Admin",
      email: "support@example.test",
      role: "SUPER_ADMIN",
      is_active: true,
    },
    workspaceUser: {
      id: "workspace-user-1",
      workspace_id: "workspace-1",
      profile_name: "EXAMPLE",
      full_name: "Example User",
      email: "user@example.test",
      email_verified: true,
      mobile_number: null,
      mobile_verified_at: null,
      created_at: now,
      updated_at: now,
      last_login_at: null,
      send_auth_otp_to_credencecraft_only: true,
    },
  });
});

describe("workspace support session user", () => {
  it("selects and returns only the workspace user session fields", async () => {
    const user = await getSessionUser();

    expect(mocks.supportSessionFindUnique).toHaveBeenCalledWith({
      where: { id: supportSessionId },
      include: expect.objectContaining({
        workspaceUser: {
          select: {
            id: true,
            workspace_id: true,
            profile_name: true,
            full_name: true,
            email: true,
            email_verified: true,
            mobile_number: true,
            mobile_verified_at: true,
            created_at: true,
            updated_at: true,
            last_login_at: true,
          },
        },
      }),
    });
    expect(user).toMatchObject({
      id: "workspace-user-1",
      workspace_id: "workspace-1",
      supportAccess: {
        platformAdminName: "Support Admin",
        reason: "Support review",
      },
    });
    expect(user).not.toHaveProperty("send_auth_otp_to_credencecraft_only");
  });
});
