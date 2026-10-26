import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { logoutSessionMock } = vi.hoisted(() => ({
  logoutSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  logoutSession: logoutSessionMock,
}));

describe("mobile OTP logout route", () => {
  let post: () => Promise<Response>;

  beforeAll(async () => {
    ({ POST: post } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    logoutSessionMock.mockResolvedValue(undefined);
  });

  it("clears the authenticated session and returns a JSON success response", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(logoutSessionMock).toHaveBeenCalledOnce();
  });

  it("allows logout when no session is active", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(logoutSessionMock).toHaveBeenCalledOnce();
  });
});
