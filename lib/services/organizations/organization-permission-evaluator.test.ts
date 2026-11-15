import { describe, expect, it } from "vitest";
import {
  evaluateOrganizationPermission,
  ORGANIZATION_PERMISSION_DENY_PREFIX,
} from "./organization-permission-evaluator";

describe("evaluateOrganizationPermission", () => {
  const defaultPermissions = ["VIEW_ORDERS", "MANAGE_USERS"];

  it("allows owner access after organization membership has been established", () => {
    expect(evaluateOrganizationPermission({
      role: "OWNER",
      permission: "MANAGE_USERS",
      storedPermissions: [],
      defaultPermissions: [],
    })).toEqual({ allowed: true, reason: "owner" });
  });

  it("uses legacy defaults when no explicit denial has been configured", () => {
    expect(evaluateOrganizationPermission({
      role: "VIEWER",
      permission: "VIEW_ORDERS",
      storedPermissions: [],
      defaultPermissions,
    })).toEqual({ allowed: true, reason: "legacy-default" });
  });

  it("preserves a legacy default grant alongside unrelated stored grants", () => {
    expect(evaluateOrganizationPermission({
      role: "VIEWER",
      permission: "VIEW_ORDERS",
      storedPermissions: ["MANAGE_ROLES"],
      defaultPermissions,
    })).toEqual({ allowed: true, reason: "legacy-default" });
  });

  it("denies a default permission after an explicit denial is persisted", () => {
    expect(evaluateOrganizationPermission({
      role: "VIEWER",
      permission: "MANAGE_USERS",
      storedPermissions: ["VIEW_ORDERS", `${ORGANIZATION_PERMISSION_DENY_PREFIX}MANAGE_USERS`],
      defaultPermissions,
    })).toEqual({ allowed: false, reason: "explicit-denial" });
  });

  it("honors an explicit denial even when a default or grant exists", () => {
    expect(evaluateOrganizationPermission({
      role: "VIEWER",
      permission: "VIEW_ORDERS",
      storedPermissions: [
        "VIEW_ORDERS",
        `${ORGANIZATION_PERMISSION_DENY_PREFIX}VIEW_ORDERS`,
      ],
      defaultPermissions,
    })).toEqual({ allowed: false, reason: "explicit-denial" });
  });

  it("denies missing permissions when neither an explicit grant nor a default exists", () => {
    expect(evaluateOrganizationPermission({
      role: "CUSTOM",
      permission: "APPROVE_ORDERS",
      storedPermissions: [],
      defaultPermissions,
    })).toEqual({ allowed: false, reason: "missing" });
  });
});
