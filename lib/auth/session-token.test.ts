import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSessionToken,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "./session-token";

let originalAuthSecret: string | undefined;

beforeEach(() => {
  originalAuthSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "session-token-test-secret";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  if (originalAuthSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = originalAuthSecret;
  }
});

describe("session token verification", () => {
  it("accepts a correctly signed, unexpired token", () => {
    const token = createSessionToken("user-123");

    expect(verifySessionToken(token)).toBe("user-123");
  });

  it("rejects malformed and tampered tokens", () => {
    const token = createSessionToken("user-123");
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;

    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("not-a-session-token")).toBeNull();
    expect(verifySessionToken(tamperedToken)).toBeNull();
  });

  it("rejects a token after its expiry", () => {
    const token = createSessionToken("user-123");
    vi.setSystemTime(Date.now() + (SESSION_TTL_SECONDS + 1) * 1000);

    expect(verifySessionToken(token)).toBeNull();
  });
});