import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueMock,
  platformFindUniqueMock,
  updateMock,
  getSessionUserMock,
  verifyTokenMock,
} =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    platformFindUniqueMock: vi.fn(),
    updateMock: vi.fn(),
    getSessionUserMock: vi.fn(),
    verifyTokenMock: vi.fn(),
  }));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    workspaceUser: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
    platformAdmin: {
      findUnique: platformFindUniqueMock,
    },
  },
}));

vi.mock("@/lib/services/platform/platform-mobile-otp-configuration-service", () => ({
  verifyPlatformMobileOtpAccessToken: verifyTokenMock,
}));

describe("mobile OTP profile route", () => {
  let get: () => Promise<Response>;
  let post: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/test");
    ({ GET: get, POST: post } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserMock.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    verifyTokenMock.mockResolvedValue("919876543210");
    findUniqueMock.mockResolvedValue(null);
    platformFindUniqueMock.mockResolvedValue(null);
    updateMock.mockResolvedValue({ id: "user-1" });
  });

  it("reports platform access for an active platform account with the same email", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
      email: "credencecraft@gmail.com",
    });
    findUniqueMock.mockResolvedValue({
      email: "credencecraft@gmail.com",
      mobile_number: "919876543210",
      mobile_verified_at: new Date(),
    });
    platformFindUniqueMock.mockResolvedValue({ is_active: true });

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      verified: true,
      platformAccess: true,
    });
    expect(platformFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "credencecraft@gmail.com" },
      select: { is_active: true },
    });
  });

  it("does not report platform access for inactive or unlinked platform accounts", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
      email: "user@example.com",
    });
    findUniqueMock.mockResolvedValue({
      email: "user@example.com",
      mobile_number: "919876543210",
      mobile_verified_at: null,
    });
    platformFindUniqueMock.mockResolvedValue({ is_active: false });

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      verified: false,
      platformAccess: false,
    });
  });

  it("links the provider-verified identifier to the authenticated account", async () => {
    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: "header.payload.signature",
          mobileNumber: "911111111111",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, verified: true });
    expect(verifyTokenMock).toHaveBeenCalledWith("header.payload.signature");
    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mobile_number: "919876543210" },
      }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: {
          mobile_number: "919876543210",
          mobile_verified_at: expect.any(Date),
        },
      }),
    );
  });

  it("rejects profile changes without an authenticated session", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "header.payload.signature" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(verifyTokenMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
