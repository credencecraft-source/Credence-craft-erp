import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, updateManyMock, issueEmailOtpMock, verifyEmailOtpMock } =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    updateManyMock: vi.fn(),
    issueEmailOtpMock: vi.fn(),
    verifyEmailOtpMock: vi.fn(),
  }));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    workspaceUser: {
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
  },
}));

vi.mock("@/lib/services/platform/platform-email-configuration-service", () => ({
  issueEmailOtp: issueEmailOtpMock,
  verifyEmailOtp: verifyEmailOtpMock,
}));

import {
  sendMobileAccountEmailOtp,
  verifyMobileAccountEmailOtp,
} from "./mobile-email-otp-auth-service";

describe("mobile account email OTP authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a purpose-scoped code only to an account's verified email", async () => {
    findUniqueMock.mockResolvedValue({
      email: "sam@example.com",
      email_verified: true,
    });

    await expect(sendMobileAccountEmailOtp("919876543210")).resolves.toBe(
      "s***@example.com",
    );
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { mobile_number: "919876543210" },
      select: { email: true, email_verified: true },
    });
    expect(issueEmailOtpMock).toHaveBeenCalledWith(
      "sam@example.com",
      "MOBILE_LOGIN",
    );
  });

  it("does not issue email OTP for missing or unverified email addresses", async () => {
    findUniqueMock.mockResolvedValue({
      email: "sam@example.com",
      email_verified: false,
    });

    await expect(sendMobileAccountEmailOtp("919876543210")).resolves.toBeNull();
    expect(issueEmailOtpMock).not.toHaveBeenCalled();
  });

  it("verifies the email challenge and atomically updates the same mobile account", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
      email: "sam@example.com",
      email_verified: true,
    });
    verifyEmailOtpMock.mockResolvedValue(true);
    updateManyMock.mockResolvedValue({ count: 1 });

    await expect(
      verifyMobileAccountEmailOtp("919876543210", "123456"),
    ).resolves.toEqual({ id: "user-1", workspace_id: "workspace-1" });
    expect(verifyEmailOtpMock).toHaveBeenCalledWith(
      "sam@example.com",
      "123456",
      "MOBILE_LOGIN",
    );
    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        mobile_number: "919876543210",
        email: "sam@example.com",
        email_verified: true,
      },
      data: { last_login_at: expect.any(Date) },
    });
  });

  it("does not update or authenticate an account for an invalid email OTP", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
      email: "sam@example.com",
      email_verified: true,
    });
    verifyEmailOtpMock.mockResolvedValue(false);

    await expect(
      verifyMobileAccountEmailOtp("919876543210", "123456"),
    ).resolves.toBeNull();
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
