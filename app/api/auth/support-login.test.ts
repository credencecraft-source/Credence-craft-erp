import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPlatformAdmin: vi.fn(),
  updatePlatformAdmin: vi.fn(),
  ensurePlatformDefaults: vi.fn(),
  issueEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  createPlatformSessionToken: vi.fn(),
  setPlatformSessionCookie: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    platformAdmin: {
      findUnique: mocks.findPlatformAdmin,
      update: mocks.updatePlatformAdmin,
    },
    workspaceUser: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/services/platform/platform-bootstrap-service", () => ({
  ensurePlatformDefaults: mocks.ensurePlatformDefaults,
}));

vi.mock("@/lib/services/platform/platform-email-configuration-service", () => ({
  issueEmailOtp: mocks.issueEmailOtp,
  verifyEmailOtp: mocks.verifyEmailOtp,
}));

vi.mock("@/lib/auth/platform-session-manager", () => ({
  createPlatformSessionToken: mocks.createPlatformSessionToken,
  setPlatformSessionCookie: mocks.setPlatformSessionCookie,
}));

vi.mock("@/lib/dev/dev-user-store-mock", () => ({
  getDevUser: vi.fn(),
  hasDevProfileName: vi.fn(),
  setDevUser: vi.fn(),
}));

vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database is unavailable.",
  isDatabaseUnavailableError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  createSessionToken: vi.fn(),
  SESSION_COOKIE_NAME: "cc_session",
}));

import { POST as sendOtp } from "./send-otp/send-otp-handler";
import { POST as verifyOtp } from "./verify-otp/verify-otp-handler";

function supportRequest(email: string, otp?: string, mobileClient = false) {
  return new Request("https://app.credencecraft.in/api/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "support",
      email,
      ...(otp ? { otp } : {}),
      ...(mobileClient ? { mobileClient: true } : {}),
    }),
  });
}

describe("platform Support email login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an OTP to any active platform account email", async () => {
    mocks.findPlatformAdmin.mockResolvedValue({ id: "admin-1", is_active: true });

    const response = await sendOtp(supportRequest("sales-admin@example.com"));

    expect(response.status).toBe(200);
    expect(mocks.ensurePlatformDefaults).not.toHaveBeenCalled();
    expect(mocks.findPlatformAdmin).toHaveBeenCalledWith({
      where: { email: "sales-admin@example.com" },
    });
    expect(mocks.issueEmailOtp).toHaveBeenCalledWith("sales-admin@example.com", "SUPPORT");
  });

  it("creates a platform session and redirects an active account to the platform", async () => {
    mocks.verifyEmailOtp.mockResolvedValue(true);
    mocks.findPlatformAdmin.mockResolvedValue({
      id: "admin-1",
      is_active: true,
    });
    mocks.updatePlatformAdmin.mockResolvedValue({});

    const response = await verifyOtp(supportRequest("sales-admin@example.com", "123456"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      redirectTo: "/platform/organisations",
    });
    expect(payload).not.toHaveProperty("sessionToken");
    expect(mocks.setPlatformSessionCookie).toHaveBeenCalledWith("admin-1");
  });

  it("returns a signed platform session token only to the native app", async () => {
    mocks.verifyEmailOtp.mockResolvedValue(true);
    mocks.findPlatformAdmin.mockResolvedValue({ id: "admin-1", is_active: true });
    mocks.updatePlatformAdmin.mockResolvedValue({});
    mocks.createPlatformSessionToken.mockReturnValue("signed-platform-token");

    const response = await verifyOtp(
      supportRequest("sales-admin@example.com", "123456", true),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      sessionToken: "signed-platform-token",
    });
    expect(mocks.createPlatformSessionToken).toHaveBeenCalledWith("admin-1");
  });

  it("does not create a platform session for an inactive account", async () => {
    mocks.verifyEmailOtp.mockResolvedValue(true);
    mocks.findPlatformAdmin.mockResolvedValue({ id: "admin-1", is_active: false });

    const response = await verifyOtp(supportRequest("sales-admin@example.com", "123456"));

    expect(response.status).toBe(403);
    expect(mocks.setPlatformSessionCookie).not.toHaveBeenCalled();
  });
});
