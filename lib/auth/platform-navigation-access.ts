export type PlatformNavigationTeamRole = "CMO" | "CTO" | "SALES_MANAGER" | null;

export function getPlatformNavigationAccess(teamRole: PlatformNavigationTeamRole) {
  return {
    canAccessConfiguration: teamRole === null,
    canAccessLeadsAndSubscriptions: teamRole === null || teamRole === "CMO",
    canAccessLeads: teamRole === null || teamRole === "CMO" || teamRole === "SALES_MANAGER",
    canManageSalesTeam: teamRole === null || teamRole === "CMO",
    canAccessWorkspace: teamRole === null,
    canAccessSupport: teamRole === "CTO",
    canAccessOrganizations: teamRole === null || teamRole === "CMO",
    canAccessCampaigns:
      teamRole === null || teamRole === "CMO" || teamRole === "SALES_MANAGER",
    canAccessAISettings: teamRole === "CTO",
    canCreateCampaignFromLeads:
      teamRole === null || teamRole === "CMO" || teamRole === "SALES_MANAGER",
  };
}

export function shouldShowPlatformNavigationSection(
  sectionTitle: string,
  isSuperAdminView: boolean,
): boolean {
  return !isSuperAdminView || sectionTitle === "Settings";
}
