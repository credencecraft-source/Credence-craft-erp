import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, findUniqueMock, updateManyMock, createSessionTokenMock, verifyTokenMock } =
  vi.hoisted(() => ({
    createMock: vi.fn(),
    findUniqueMock: vi.fn(),
    updateManyMock: vi.fn(),
    createSessionTokenMock: vi.fn(() => "session-token"),
    verifyTokenMock: vi.fn(),
  }));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    workspaceUser: {
      create: createMock,
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
  },
}));

vi.mock("@/lib/auth/session-manager", () => ({
  createSessionToken: createSessionTokenMock,
  SESSION_COOKIE_NAME: "test-session",
}));

vi.mock("@/lib/services/platform/platform-mobile-otp-configuration-service", () => ({
  verifyPlatformMobileOtpAccessToken: verifyTokenMock,
}));

describe("mobile OTP sign-in route", () => {
  let post: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/test");
    ({ POST: post } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    verifyTokenMock.mockResolvedValue("919876543210");
    findUniqueMock.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
      profile_name: "sam",
      full_name: "Sam",
      email: "sam@example.com",
      mobile_verified_at: new Date(),
    });
    updateManyMock.mockResolvedValue({ count: 1 });
    createMock.mockResolvedValue({
      id: "new-user",
      workspace_id: "new-workspace",
      profile_name: "mobile-account",
      full_name: "Taylor Example",
      email: null,
      mobile_verified_at: new Date(),
    });
  });

  it("does not authenticate a registered mobile account with an SMS OTP", async () => {
    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "header.payload.signature" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("already registered"),
    });
    expect(verifyTokenMock).toHaveBeenCalledWith("header.payload.signature");
    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mobile_number: "919876543210" },
      }),
    );
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("creates a workspace account for a newly verified mobile number and starts organization setup", async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: "header.payload.signature",
          fullName: "Taylor Example",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      redirectTo: "/dashboard/organizations/create",
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspace_id: expect.any(String),
          profile_name: expect.any(String),
          full_name: "Taylor Example",
          email: null,
          email_verified: false,
          mobile_number: "919876543210",
          mobile_verified_at: expect.any(Date),
          last_login_at: expect.any(Date),
        }),
      }),
    );
    expect(createSessionTokenMock).toHaveBeenCalledWith("new-user");
    expect(response.headers.get("set-cookie")).toContain("test-session=session-token");
  });

  it("requires email OTP for an existing account even if its mobile link is unverified", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
      profile_name: "sam",
      full_name: "Sam",
      email: "sam@example.com",
      mobile_verified_at: null,
    });

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "header.payload.signature" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(createSessionTokenMock).not.toHaveBeenCalled();
  });

  it("does not create an account unless MSG91 has verified the token", async () => {
    verifyTokenMock.mockResolvedValue(null);

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "header.payload.signature" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
    expect(createSessionTokenMock).not.toHaveBeenCalled();
  });

  it("creates an account for a new mobile number without asking for a name", async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "header.payload.signature" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      redirectTo: "/dashboard/organizations/create",
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          full_name: "Mobile User",
          mobile_number: "919876543210",
        }),
      }),
    );
    expect(createSessionTokenMock).toHaveBeenCalledWith("new-user");
  });
});
