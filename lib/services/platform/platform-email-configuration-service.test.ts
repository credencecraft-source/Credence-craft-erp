import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findChallenge: vi.fn(),
  updateChallenges: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    otpChallenge: {
      findFirst: mocks.findChallenge,
      updateMany: mocks.updateChallenges,
    },
  },
}));

import { verifyEmailOtp } from "./platform-email-configuration-service";

const testSecret = "platform-otp-test-secret";
const normalizedEmail = "admin@example.com";
const code = "123456";
const codeHash = createHmac("sha256", testSecret).update(`${normalizedEmail}:${code}`).digest("hex");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", testSecret);
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

describe("email OTP verification", () => {
  it("consumes an OTP with one conditional database transition", async () => {
    await expect(verifyEmailOtp(normalizedEmail, code, "SUPPORT")).resolves.toBe(true);

    expect(mocks.findChallenge).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        email: normalizedEmail,
        purpose: "SUPPORT",
        consumed_at: null,
        attempts: { lt: 5 },
      }),
    }));
    expect(mocks.updateChallenges).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "otp-challenge-id",
        consumed_at: null,
        attempts: { lt: 5 },
      }),
      data: { consumed_at: expect.any(Date) },
    }));
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
    await expect(verifyEmailOtp(normalizedEmail, "654321", "SUPPORT")).resolves.toBe(false);

    expect(mocks.updateChallenges).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "otp-challenge-id",
        consumed_at: null,
        attempts: { lt: 5 },
      }),
      data: { attempts: { increment: 1 } },
    }));
  });
});
