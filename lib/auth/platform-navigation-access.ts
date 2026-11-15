export type PlatformNavigationTeamRole = "CMO" | "CTO" | "SALES_MANAGER" | null;

export function getPlatformNavigationAccess(teamRole: PlatformNavigationTeamRole) {
  return {
    canAccessConfiguration: teamRole === null,
    canAccessLeadsAndSubscriptions: teamRole === null || teamRole === "CMO",
    canAccessLeads: teamRole === null || teamRole === "CMO" || teamRole === "SALES_MANAGER",
    canManageSalesTeam: teamRole === null || teamRole === "CMO",
    canAccessWorkspace: teamRole === null,
    canAccessSupport: teamRole === "CTO",
  };
}
