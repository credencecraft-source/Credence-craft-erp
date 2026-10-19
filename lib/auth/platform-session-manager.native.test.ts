import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  getHeader: vi.fn(),
  findPlatformAdmin: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.getCookie,
    delete: vi.fn(),
    set: vi.fn(),
  })),
  headers: vi.fn(async () => ({ get: mocks.getHeader })),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    platformAdmin: { findUnique: mocks.findPlatformAdmin },
  },
}));

import { getPlatformSessionAdmin } from "./platform-session-manager";
import { createPlatformSessionToken } from "./session-token";

describe("native platform session authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCookie.mockImplementation((name: string) => {
      if (name === "cc_platform_session") return undefined;
      if (name === "cc_platform_view") return undefined;
      return undefined;
    });
    mocks.getHeader.mockReturnValue(null);
    mocks.findPlatformAdmin.mockResolvedValue({
      id: "admin-1",
      admin_id: "platform-1",
      full_name: "Platform Admin",
      email: "admin@example.com",
      is_active: true,
      role: "SUPER_ADMIN",
      team_role: null,
      mobile_number: null,
    });
  });

  it("authenticates a signed native bearer token when cookies are unavailable", async () => {
    mocks.getHeader.mockImplementation((name: string) =>
      name === "authorization"
        ? `Bearer ${createPlatformSessionToken("admin-1")}`
        : null,
    );

    const admin = await getPlatformSessionAdmin();

    expect(admin?.id).toBe("admin-1");
    expect(mocks.findPlatformAdmin).toHaveBeenCalledWith({
      where: { id: "admin-1" },
    });
  });

  it("applies only an allowed platform view from the native request", async () => {
    mocks.getHeader.mockImplementation((name: string) => {
      if (name === "authorization") {
        return `Bearer ${createPlatformSessionToken("admin-1")}`;
      }
      if (name === "x-platform-view") return "CTO";
      return null;
    });

    const admin = await getPlatformSessionAdmin();

    expect(admin).toMatchObject({
      actualRole: "SUPER_ADMIN",
      role: "ADMIN",
      team_role: "CTO",
    });
  });

  it("ignores a native view that the account is not allowed to select", async () => {
    mocks.getHeader.mockImplementation((name: string) => {
      if (name === "authorization") {
        return `Bearer ${createPlatformSessionToken("admin-1")}`;
      }
      if (name === "x-platform-view") return "ROOT";
      return null;
    });

    const admin = await getPlatformSessionAdmin();

    expect(admin).toMatchObject({
      actualRole: "SUPER_ADMIN",
      role: "SUPER_ADMIN",
      team_role: null,
    });
  });
});
