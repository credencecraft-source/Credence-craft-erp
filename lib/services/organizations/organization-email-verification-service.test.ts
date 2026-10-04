import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOrganizationEmailVerificationToken,
  isOrganizationEmailVerificationTokenValid,
} from "./organization-email-verification-service";

describe("organization email verification tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("accepts a token only for its user and normalized email", () => {
    vi.stubEnv("AUTH_SECRET", "organization-email-test-secret");
    const token = createOrganizationEmailVerificationToken("user-1", "Owner@Example.com");

    expect(isOrganizationEmailVerificationTokenValid(token, "user-1", "owner@example.com")).toBe(true);
    expect(isOrganizationEmailVerificationTokenValid(token, "user-2", "owner@example.com")).toBe(false);
    expect(isOrganizationEmailVerificationTokenValid(token, "user-1", "other@example.com")).toBe(false);
  });

  it("rejects tampered and expired tokens", () => {
    vi.stubEnv("AUTH_SECRET", "organization-email-test-secret");
    const token = createOrganizationEmailVerificationToken("user-1", "owner@example.com");

    expect(isOrganizationEmailVerificationTokenValid(`${token}x`, "user-1", "owner@example.com")).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(isOrganizationEmailVerificationTokenValid(token, "user-1", "owner@example.com")).toBe(false);
  });
});
