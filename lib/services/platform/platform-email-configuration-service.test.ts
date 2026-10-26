import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    platformEmailConfiguration: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    platformAuditEvent: { create: vi.fn() },
  };
  return {
    auditCreate: transaction.platformAuditEvent.create,
    countChallenges: vi.fn(),
    createChallenge: vi.fn(),
    createTransport: vi.fn(),
    findChallenge: vi.fn(),
    findConfiguration: vi.fn(),
    requirePlatformSessionAdmin: vi.fn(),
    sendMail: vi.fn(),
    transaction,
    transactionMock: vi.fn(),
    updateChallenges: vi.fn(),
    updateConfiguration: transaction.platformEmailConfiguration.update,
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transactionMock,
    otpChallenge: {
      count: mocks.countChallenges,
      create: mocks.createChallenge,
      findFirst: mocks.findChallenge,
      updateMany: mocks.updateChallenges,
    },
    platformEmailConfiguration: { findUnique: mocks.findConfiguration },
  },
}));

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: mocks.requirePlatformSessionAdmin,
}));

vi.mock("@/lib/auth/secret-cryptography", () => ({
  decryptSecret: vi.fn(() => "smtp-password"),
  encryptSecret: vi.fn(() => "encrypted-password"),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

import {
  getAuthOtpCopySetting,
  issueEmailOtp,
  setAuthOtpCopySetting,
  verifyEmailOtp,
} from "./platform-email-configuration-service";

const testSecret = "platform-otp-test-secret";
const normalizedEmail = "admin@example.com";
const code = "123456";
const codeHash = createHmac("sha256", testSecret)
  .update(`${normalizedEmail}:${code}`)
  .digest("hex");
const emailConfiguration = {
  id: "default",
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_secure: false,
  smtp_username: "mailer@example.com",
  smtp_password_encrypted: "encrypted-password",
  from_email: "mailer@example.com",
  from_name: "Credence Craft",
  is_active: true,
  send_auth_otp_to_credencecraft: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", testSecret);
  mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "admin-id" });
  mocks.transactionMock.mockImplementation(
    (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction),
  );
  mocks.transaction.platformEmailConfiguration.findUnique.mockResolvedValue({
    send_auth_otp_to_credencecraft: false,
  });
  mocks.findConfiguration.mockResolvedValue(emailConfiguration);
  mocks.countChallenges.mockResolvedValue(0);
  mocks.createChallenge.mockResolvedValue({});
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  mocks.sendMail.mockResolvedValue({});
  mocks.findChallenge.mockResolvedValue({
    id: "otp-challenge-id",
    code_hash: codeHash,
    attempts: 0,
  });
  mocks.updateChallenges.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email OTP delivery", () => {
  it("uses complete deployment SMTP settings to send OTPs without platform email configuration", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "platform@example.com");
    vi.stubEnv("SMTP_PASS", "deployment-app-password");
    vi.stubEnv("SMTP_FROM", "platform@example.com");
    vi.stubEnv("SMTP_FROM_NAME", "Platform Mail");
    mocks.findConfiguration.mockResolvedValue(null);

    await issueEmailOtp(normalizedEmail, "SUPPORT");

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "platform@example.com",
        pass: "deployment-app-password",
      },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Platform Mail <platform@example.com>",
        to: normalizedEmail,
        subject: "Your Credence Craft verification code",
      }),
    );
  });

  it("uses active database SMTP settings even when deployment SMTP settings are incomplete", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_PORT", "587");

    await issueEmailOtp(normalizedEmail, "SUPPORT");

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: {
        user: "mailer@example.com",
        pass: "smtp-password",
      },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Credence Craft <mailer@example.com>",
        to: normalizedEmail,
      }),
    );
  });

  it("uses deployment SMTP settings when the database configuration is inactive", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "platform@example.com");
    vi.stubEnv("SMTP_PASS", "deployment-app-password");
    vi.stubEnv("SMTP_FROM", "platform@example.com");
    mocks.findConfiguration.mockResolvedValue({
      ...emailConfiguration,
      is_active: false,
    });

    await issueEmailOtp(normalizedEmail, "SUPPORT");

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "platform@example.com",
        pass: "deployment-app-password",
      },
    });
  });

  it("reports inactive database email settings when no deployment fallback exists", async () => {
    mocks.findConfiguration.mockResolvedValue({
      ...emailConfiguration,
      is_active: false,
    });

    await expect(issueEmailOtp(normalizedEmail, "SUPPORT")).rejects.toThrow(
      "Platform email is not configured or is inactive.",
    );
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("privately copies customer authentication OTPs when enabled", async () => {
    mocks.findConfiguration.mockResolvedValue({
      ...emailConfiguration,
      send_auth_otp_to_credencecraft: true,
    });

    await issueEmailOtp(normalizedEmail);

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: normalizedEmail,
        bcc: "credencecraft@gmail.com",
      }),
    );
  });

  it("sends customer authentication OTPs only to the customer when disabled", async () => {
    await issueEmailOtp(normalizedEmail);

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.not.objectContaining({ bcc: expect.anything() }),
    );
  });

  it("privately copies mobile-login OTPs sent to a registered user's email", async () => {
    mocks.findConfiguration.mockResolvedValue({
      ...emailConfiguration,
      send_auth_otp_to_credencecraft: true,
    });

    await issueEmailOtp(normalizedEmail, "MOBILE_LOGIN");

    expect(mocks.createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: normalizedEmail,
          purpose: "MOBILE_LOGIN",
        }),
      }),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: normalizedEmail,
        bcc: "credencecraft@gmail.com",
        text: expect.stringMatching(/^\s*Your verification code is \d{6}\./),
      }),
    );
  });

  it("does not copy platform support OTPs", async () => {
    mocks.findConfiguration.mockResolvedValue({
      ...emailConfiguration,
      send_auth_otp_to_credencecraft: true,
    });

    await issueEmailOtp(normalizedEmail, "SUPPORT");

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.not.objectContaining({ bcc: expect.anything() }),
    );
  });
});

describe("platform authentication OTP copy setting", () => {
  it("requires a platform admin before reading the setting", async () => {
    mocks.requirePlatformSessionAdmin.mockRejectedValue(
      new Error("Unauthorized."),
    );

    await expect(getAuthOtpCopySetting()).rejects.toThrow("Unauthorized.");
    expect(mocks.findConfiguration).not.toHaveBeenCalled();
  });

  it("returns disabled when no platform email configuration exists", async () => {
    mocks.findConfiguration.mockResolvedValue(null);

    await expect(getAuthOtpCopySetting()).resolves.toBe(false);
  });

  it("updates and audits a changed setting", async () => {
    await expect(setAuthOtpCopySetting(true)).resolves.toBe(true);

    expect(mocks.updateConfiguration).toHaveBeenCalledWith({
      where: { id: "default" },
      data: { send_auth_otp_to_credencecraft: true },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "admin-id",
        action: "PLATFORM_AUTH_OTP_COPY_SETTING_UPDATED",
        entity_type: "PlatformEmailConfiguration",
        entity_id: "default",
        details: {
          sendAuthOtpToCredencecraft: { before: false, after: true },
        },
      },
    });
  });

  it("does not enable OTP copies until email delivery is configured", async () => {
    mocks.transaction.platformEmailConfiguration.findUnique.mockResolvedValue(
      null,
    );

    await expect(setAuthOtpCopySetting(true)).rejects.toThrow(
      "Configure platform email delivery",
    );
    expect(mocks.updateConfiguration).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});

describe("email OTP verification", () => {
  it("consumes an OTP with one conditional database transition", async () => {
    await expect(
      verifyEmailOtp(normalizedEmail, code, "SUPPORT"),
    ).resolves.toBe(true);

    expect(mocks.findChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: normalizedEmail,
          purpose: "SUPPORT",
          consumed_at: null,
          attempts: { lt: 5 },
        }),
      }),
    );
    expect(mocks.updateChallenges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "otp-challenge-id",
          consumed_at: null,
          attempts: { lt: 5 },
        }),
        data: { consumed_at: expect.any(Date) },
      }),
    );
  });

  it("allows only one concurrent successful request to consume the challenge", async () => {
    mocks.updateChallenges
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.all([
      verifyEmailOtp(normalizedEmail, code, "SUPPORT"),
      verifyEmailOtp(normalizedEmail, code, "SUPPORT"),
    ]);

    expect(results.sort()).toEqual([false, true]);
  });

  it("increments failed guesses only while the challenge remains active and under the attempt limit", async () => {
    await expect(
      verifyEmailOtp(normalizedEmail, "654321", "SUPPORT"),
    ).resolves.toBe(false);

    expect(mocks.updateChallenges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "otp-challenge-id",
          consumed_at: null,
          attempts: { lt: 5 },
        }),
        data: { attempts: { increment: 1 } },
      }),
    );
  });
});
