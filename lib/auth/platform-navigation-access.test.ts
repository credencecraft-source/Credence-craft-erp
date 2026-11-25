import { describe, expect, it } from "vitest";

import {
  getPlatformNavigationAccess,
  shouldShowPlatformNavigationSection,
} from "./platform-navigation-access";

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
        canAccessOrganizations: true,
        canAccessCampaigns: true,
        canAccessAISettings: false,
        canCreateCampaignFromLeads: true,
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
        canAccessOrganizations: true,
        canAccessCampaigns: true,
        canAccessAISettings: false,
        canCreateCampaignFromLeads: true,
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
        canAccessOrganizations: false,
        canAccessCampaigns: false,
        canAccessAISettings: true,
        canCreateCampaignFromLeads: false,
      },
    },
  ])("returns the configured platform navigation for $teamRole", ({ teamRole, expected }) => {
    expect(getPlatformNavigationAccess(teamRole)).toEqual(expected);
  });

  it("allows Sales Managers into Leads and Campaigns without subscriptions or team management", () => {
    expect(getPlatformNavigationAccess("SALES_MANAGER")).toEqual({
      canAccessConfiguration: false,
      canAccessLeadsAndSubscriptions: false,
      canAccessLeads: true,
      canManageSalesTeam: false,
      canAccessWorkspace: false,
      canAccessSupport: false,
      canAccessOrganizations: false,
      canAccessCampaigns: true,
      canAccessAISettings: false,
      canCreateCampaignFromLeads: true,
    });
  });

  it("shows only Settings in Super Admin view", () => {
    expect(shouldShowPlatformNavigationSection("Settings", true)).toBe(true);
    expect(shouldShowPlatformNavigationSection("Admin", true)).toBe(false);
    expect(shouldShowPlatformNavigationSection("Organisations", true)).toBe(false);
  });

  it("shows the normal sections outside Super Admin view", () => {
    expect(shouldShowPlatformNavigationSection("Settings", false)).toBe(true);
    expect(shouldShowPlatformNavigationSection("Admin", false)).toBe(true);
  });
});
