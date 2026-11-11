export const ORGANIZATION_PERMISSION_DENY_PREFIX = "DENY:";

export type OrganizationPermissionEvaluation = {
  allowed: boolean;
  reason: "owner" | "explicit-grant" | "explicit-denial" | "legacy-default" | "missing";
};

export function evaluateOrganizationPermission(input: {
  role: string;
  permission: string;
  storedPermissions: readonly string[];
  defaultPermissions: readonly string[];
}): OrganizationPermissionEvaluation {
  if (input.role === "OWNER") {
    return { allowed: true, reason: "owner" };
  }

  if (input.storedPermissions.includes(`${ORGANIZATION_PERMISSION_DENY_PREFIX}${input.permission}`)) {
    return { allowed: false, reason: "explicit-denial" };
  }

  if (input.storedPermissions.includes(input.permission)) {
    return { allowed: true, reason: "explicit-grant" };
  }

  return input.defaultPermissions.includes(input.permission)
    ? { allowed: true, reason: "legacy-default" }
    : { allowed: false, reason: "missing" };
}
