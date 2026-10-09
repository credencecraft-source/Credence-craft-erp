import { describe, expect, it } from "vitest";

import { getPlatformNavigationAccess } from "./platform-navigation-access";

describe("getPlatformNavigationAccess", () => {
  it.each([
    {
      teamRole: null,
      expected: {
        canAccessConfiguration: true,
        canAccessLeadsAndSubscriptions: false,
        canAccessWorkspace: true,
        canAccessSupport: false,
      },
    },
    {
      teamRole: "CMO" as const,
      expected: {
        canAccessConfiguration: false,
        canAccessLeadsAndSubscriptions: true,
        canAccessWorkspace: true,
        canAccessSupport: false,
      },
    },
    {
      teamRole: "CTO" as const,
      expected: {
        canAccessConfiguration: false,
        canAccessLeadsAndSubscriptions: false,
        canAccessWorkspace: false,
        canAccessSupport: true,
      },
    },
  ])("returns the configured platform navigation for $teamRole", ({ teamRole, expected }) => {
    expect(getPlatformNavigationAccess(teamRole)).toEqual(expected);
  });
});
