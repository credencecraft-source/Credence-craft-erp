import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("react", () => ({ cache: (callback: (...args: never[]) => unknown) => callback }));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    platformAdmin: { findUnique: mocks.findPlatformAdmin },
  },
}));

import { createPlatformSessionToken } from "./session-token";

const originalAuthSecret = process.env.AUTH_SECRET;

describe("native platform session authentication", () => {
  beforeEach(async () => {
    await vi.resetModules();
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "native-platform-session-test-secret";
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

  afterEach(() => {
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  function setNativeHeaders(view?: string) {
    const token = createPlatformSessionToken("admin-1");
    mocks.getHeader.mockImplementation((name: string) => {
      if (name === "authorization") return `Bearer ${token}`;
      if (name === "x-platform-view") return view ?? null;
      return null;
    });
  }

  it("authenticates a signed native bearer token when cookies are unavailable", async () => {
    setNativeHeaders();
    const { getPlatformSessionAdmin } = await import("./platform-session-manager");

    const admin = await getPlatformSessionAdmin();

    expect(admin?.id).toBe("admin-1");
    expect(mocks.findPlatformAdmin).toHaveBeenCalledWith({
      where: { id: "admin-1" },
    });
  });

  it("applies an authorized platform view from the native request", async () => {
    setNativeHeaders("CTO");
    const { getPlatformSessionAdmin } = await import("./platform-session-manager");

    const admin = await getPlatformSessionAdmin();

    expect(admin).toMatchObject({
      actualRole: "SUPER_ADMIN",
      role: "ADMIN",
      team_role: "CTO",
    });
  });

  it("rejects a native view that the account is not allowed to select", async () => {
    setNativeHeaders("ROOT");
    const { getPlatformSessionAdmin } = await import("./platform-session-manager");

    await expect(getPlatformSessionAdmin()).resolves.toBeNull();
  });

  it("allows CMO view to access the Leads module", async () => {
    setNativeHeaders("CMO");
    const { requirePlatformNavigationPermission } = await import("./platform-session-manager");

    await expect(requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions"))
      .resolves.toMatchObject({ team_role: "CMO" });
  });

  it("denies CTO view access to the Leads module", async () => {
    setNativeHeaders("CTO");
    const { requirePlatformNavigationPermission } = await import("./platform-session-manager");

    await expect(requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions"))
      .rejects.toThrow("You do not have access to this platform module.");
  });
});
