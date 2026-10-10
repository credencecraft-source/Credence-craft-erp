export type PlatformNavigationTeamRole = "CMO" | "CTO" | null;

export function getPlatformNavigationAccess(teamRole: PlatformNavigationTeamRole) {
  return {
    canAccessConfiguration: teamRole === null,
    canAccessLeadsAndSubscriptions: teamRole === "CMO",
    canAccessWorkspace: teamRole === null,
    canAccessSupport: teamRole === "CTO",
  };
}
