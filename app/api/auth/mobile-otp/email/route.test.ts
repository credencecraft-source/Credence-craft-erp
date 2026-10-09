import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  sendEmailOtpMock,
  verifyEmailOtpMock,
  createSessionTokenMock,
} = vi.hoisted(() => ({
  sendEmailOtpMock: vi.fn(),
  verifyEmailOtpMock: vi.fn(),
  createSessionTokenMock: vi.fn(() => "session-token"),
}));

vi.mock("@/lib/services/auth/mobile-email-otp-auth-service", () => ({
  sendMobileAccountEmailOtp: sendEmailOtpMock,
  verifyMobileAccountEmailOtp: verifyEmailOtpMock,
}));

vi.mock("@/lib/auth/session-manager", () => ({
  createSessionToken: createSessionTokenMock,
  SESSION_COOKIE_NAME: "test-session",
}));

describe("mobile email OTP route", () => {
  let post: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ POST: post } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates mobile numbers before account lookup", async () => {
    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", mobileNumber: "+919876543210" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(sendEmailOtpMock).not.toHaveBeenCalled();
  });

  it("returns the full verified email destination when its OTP is sent", async () => {
    sendEmailOtpMock.mockResolvedValue({
      registered: true,
      email: "sam@example.com",
    });

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          mobileNumber: "919876543210",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      registered: true,
      emailOtpSent: true,
      emailHint: "sam@example.com",
    });
    expect(sendEmailOtpMock).toHaveBeenCalledWith("919876543210");
  });

  it("identifies registered accounts without a verified email without sending SMS OTP", async () => {
    sendEmailOtpMock.mockResolvedValue({ registered: true, email: null });

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          mobileNumber: "919876543210",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      registered: true,
      emailOtpSent: false,
      emailHint: null,
    });
  });

  it("creates a session only after the mobile-linked email OTP verifies", async () => {
    verifyEmailOtpMock.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
    });

    const response = await post(
      new Request("http://localhost/api/auth/mobile-otp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          mobileNumber: "919876543210",
          otp: "123456",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      redirectTo: "/dashboard/workspace-1/home",
    });
    expect(verifyEmailOtpMock).toHaveBeenCalledWith("919876543210", "123456");
    expect(createSessionTokenMock).toHaveBeenCalledWith("user-1");
    expect(response.headers.get("set-cookie")).toContain(
      "test-session=session-token",
    );
  });
});
