import { describe, expect, it } from "vitest";

import { POST } from "./platform-login-handler";

describe("platform password login", () => {
  it("retires the password path for existing and new platform accounts", async () => {
    const response = await POST();

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "Password sign-in is unavailable. Use the platform email verification code.",
    });
  });
});
