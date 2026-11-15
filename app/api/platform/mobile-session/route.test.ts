import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlatformSessionAdmin: vi.fn(),
  getAvailablePlatformViews: vi.fn(),
  logoutPlatformSession: vi.fn(),
  setPlatformViewMode: vi.fn(),
}));

vi.mock("@/lib/auth/platform-session-manager", () => ({
  getPlatformSessionAdmin: mocks.getPlatformSessionAdmin,
  getAvailablePlatformViews: mocks.getAvailablePlatformViews,
  logoutPlatformSession: mocks.logoutPlatformSession,
  setPlatformViewMode: mocks.setPlatformViewMode,
}));

import { DELETE, GET, POST } from "./route";

const superAdmin = {
  id: "admin-1",
  full_name: "Platform Admin",
  email: "admin@example.com",
  actualRole: "SUPER_ADMIN" as const,
  role: "SUPER_ADMIN" as const,
  team_role: null,
};

describe("platform mobile session API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlatformSessionAdmin.mockResolvedValue(superAdmin);
    mocks.getAvailablePlatformViews.mockReturnValue(["SUPER_ADMIN", "ADMIN", "CMO", "CTO"]);
  });

  it("returns the authenticated platform admin and its authorized views", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      admin: {
        id: "admin-1",
        fullName: "Platform Admin",
        email: "admin@example.com",
        actualRole: "SUPER_ADMIN",
        teamRole: null,
      },
      availableViews: ["SUPER_ADMIN", "ADMIN", "CMO", "CTO"],
      activeView: "SUPER_ADMIN",
    });
  });

  it("rejects unauthenticated session reads and role changes", async () => {
    mocks.getPlatformSessionAdmin.mockResolvedValue(null);

    const getResponse = await GET();
    const postResponse = await POST(new Request("https://example.test/api/platform/mobile-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view: "CMO" }),
    }));

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
  });

  it("rejects a role not granted to the authenticated admin", async () => {
    mocks.getAvailablePlatformViews.mockReturnValue(["ADMIN"]);
    const response = await POST(new Request("https://example.test/api/platform/mobile-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view: "SUPER_ADMIN" }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.setPlatformViewMode).not.toHaveBeenCalled();
  });

  it("sets an authorized view and returns it in the response", async () => {
    const response = await POST(new Request("https://example.test/api/platform/mobile-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view: "CMO" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.setPlatformViewMode).toHaveBeenCalledWith("CMO");
    await expect(response.json()).resolves.toMatchObject({ activeView: "CMO" });
  });

  it("clears the platform session on logout", async () => {
    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.logoutPlatformSession).toHaveBeenCalledOnce();
  });
});
