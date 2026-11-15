import { afterEach, describe, expect, it, vi } from "vitest";

import { encryptSecret } from "@/lib/auth/secret-cryptography";
import {
  hasMatchingEsslPushToken,
  validateEsslPushPayload,
} from "./essl-biometric-integration-service";

describe("ESSL push receiver validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates the forwarding token without timing-sensitive string comparison", () => {
    vi.stubEnv("AUTH_SECRET", "essl-test-secret");
    const encryptedToken = encryptSecret("valid-erp-forwarding-token");

    expect(
      hasMatchingEsslPushToken("valid-erp-forwarding-token", encryptedToken),
    ).toBe(true);
    expect(hasMatchingEsslPushToken("incorrect-token", encryptedToken)).toBe(false);
    expect(hasMatchingEsslPushToken("", encryptedToken)).toBe(false);
    expect(hasMatchingEsslPushToken("bad-token", "")).toBe(false);
  });

  it("accepts non-empty device payloads up to 64 KB", () => {
    expect(() => validateEsslPushPayload("ATTLOG\t1\t2026-10-10 09:05:03")).not.toThrow();
    expect(() => validateEsslPushPayload("x".repeat(64 * 1024))).not.toThrow();
  });

  it("rejects empty and oversized device payloads", () => {
    expect(() => validateEsslPushPayload("")).toThrow(
      "ESSL attendance push cannot be empty.",
    );
    expect(() => validateEsslPushPayload("x".repeat(64 * 1024 + 1))).toThrow(
      "ESSL attendance push exceeds the 64 KB limit.",
    );
  });
});
