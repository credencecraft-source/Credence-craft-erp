import { describe, expect, it } from "vitest";

import { getPlatformNavigationAccess } from "./platform-navigation-access";

describe("getPlatformNavigationAccess", () => {
  it.each([
    {
      teamRole: null,
      expected: {
        canAccessConfiguration: true,
        canAccessLeadsAndSubscriptions: true,
        canAccessLeads: true,
        canManageSalesTeam: true,
        canAccessWorkspace: true,
        canAccessSupport: false,
      },
    },
    {
      teamRole: "CMO" as const,
      expected: {
        canAccessConfiguration: false,
        canAccessLeadsAndSubscriptions: true,
        canAccessLeads: true,
        canManageSalesTeam: true,
        canAccessWorkspace: false,
        canAccessSupport: false,
      },
    },
    {
      teamRole: "CTO" as const,
      expected: {
        canAccessConfiguration: false,
        canAccessLeadsAndSubscriptions: false,
        canAccessLeads: false,
        canManageSalesTeam: false,
        canAccessWorkspace: false,
        canAccessSupport: true,
      },
    },
  ])("returns the configured platform navigation for $teamRole", ({ teamRole, expected }) => {
    expect(getPlatformNavigationAccess(teamRole)).toEqual(expected);
  });

  it("allows Sales Managers into Leads without granting subscriptions or team management", () => {
    expect(getPlatformNavigationAccess("SALES_MANAGER")).toEqual({
      canAccessConfiguration: false,
      canAccessLeadsAndSubscriptions: false,
      canAccessLeads: true,
      canManageSalesTeam: false,
      canAccessWorkspace: false,
      canAccessSupport: false,
    });
  });
});
