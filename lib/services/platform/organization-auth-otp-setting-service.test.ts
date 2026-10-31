import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    platformAuditEvent: { create: vi.fn() },
  };
  return {
    requirePlatformSessionAdmin: vi.fn(),
    transaction,
    transactionMock: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.transactionMock },
}));

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: mocks.requirePlatformSessionAdmin,
}));

import { setOrganizationAuthOtpCopySetting } from "./organization-auth-otp-setting-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
  mocks.transactionMock.mockImplementation(
    (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction),
  );
  mocks.transaction.organization.findUnique.mockResolvedValue({
    id: "organization-internal-id",
    send_auth_otp_to_credencecraft: false,
  });
});

describe("organization authentication OTP copy setting", () => {
  it("requires a platform admin before changing an organization", async () => {
    mocks.requirePlatformSessionAdmin.mockRejectedValue(new Error("Unauthorized."));

    await expect(
      setOrganizationAuthOtpCopySetting("organization-internal-id", true),
    ).rejects.toThrow("Unauthorized.");
    expect(mocks.transaction.organization.findUnique).not.toHaveBeenCalled();
  });

  it("updates and audits the organization setting", async () => {
    await expect(
      setOrganizationAuthOtpCopySetting("organization-internal-id", true),
    ).resolves.toBe(true);

    expect(mocks.transaction.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "organization-internal-id" },
      select: { id: true, send_auth_otp_to_credencecraft: true },
    });
    expect(mocks.transaction.organization.update).toHaveBeenCalledWith({
      where: { id: "organization-internal-id" },
      data: { send_auth_otp_to_credencecraft: true },
    });
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "platform-admin-id",
        action: "PLATFORM_ORGANIZATION_AUTH_OTP_COPY_SETTING_UPDATED",
        entity_type: "Organization",
        entity_id: "organization-internal-id",
        details: {
          sendAuthOtpToCredencecraft: { before: false, after: true },
        },
      },
    });
  });

  it("does not update or audit an unchanged setting", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      id: "organization-internal-id",
      send_auth_otp_to_credencecraft: true,
    });

    await expect(
      setOrganizationAuthOtpCopySetting("organization-internal-id", true),
    ).resolves.toBe(true);
    expect(mocks.transaction.organization.update).not.toHaveBeenCalled();
    expect(mocks.transaction.platformAuditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a missing organization without writing", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue(null);

    await expect(
      setOrganizationAuthOtpCopySetting("missing-organization", true),
    ).rejects.toThrow("Organization not found.");
    expect(mocks.transaction.organization.update).not.toHaveBeenCalled();
  });
});
