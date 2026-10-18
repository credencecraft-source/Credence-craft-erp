import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, requirePlatformSessionAdminMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  requirePlatformSessionAdminMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));

import PlatformSettingsLayout from "./layout";

describe("PlatformSettingsLayout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it.each(["CMO", "CTO"] as const)("redirects %s views instead of raising a page error", async (teamRole) => {
    requirePlatformSessionAdminMock.mockResolvedValue({ team_role: teamRole });

    await expect(PlatformSettingsLayout({ children: "Settings" })).rejects.toThrow(
      "REDIRECT:/platform/organisations",
    );
  });

  it("renders settings for platform admins without a team role", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({ team_role: null });

    await expect(PlatformSettingsLayout({ children: "Settings" })).resolves.toBe("Settings");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
