import { describe, expect, it } from "vitest";

import {
  assertPlatformConfigurationAccess,
  assertPlatformSuperAdmin,
  getEffectivePlatformRole,
  type PlatformSessionAdmin,
} from "@/lib/auth/platform-session-manager";

function makeAdmin(role: PlatformSessionAdmin["role"]): PlatformSessionAdmin {
  return {
    id: "platform-account",
    admin_id: "platform-account-public",
    full_name: "Platform User",
    email: "platform@example.com",
    is_active: true,
    role,
    actualRole: role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN",
    team_role: null,
    mobile_number: null,
  };
}

describe("platform view permissions", () => {
  it("allows Super Admin to switch only down to Admin view", () => {
    expect(getEffectivePlatformRole("SUPER_ADMIN", "ADMIN")).toBe("ADMIN");
    expect(getEffectivePlatformRole("SUPER_ADMIN", undefined)).toBe("SUPER_ADMIN");
    expect(getEffectivePlatformRole("ADMIN", "SUPER_ADMIN")).toBe("ADMIN");
  });

  it("does not grant delete-level authority while Super Admin is in Admin view", () => {
    expect(() =>
      assertPlatformSuperAdmin({
        ...makeAdmin("ADMIN"),
        actualRole: "SUPER_ADMIN",
      }),
    ).toThrow("This action requires Super Admin access.");
  });

  it("allows destructive platform actions only in Super Admin view", () => {
    expect(() => assertPlatformSuperAdmin(makeAdmin("SUPER_ADMIN"))).not.toThrow();
    expect(() => assertPlatformSuperAdmin(makeAdmin("ADMIN"))).toThrow(
      "This action requires Super Admin access.",
    );
  });

  it.each(["CMO", "CTO"] as const)("denies %s team accounts access to platform configuration", (teamRole) => {
    expect(() =>
      assertPlatformConfigurationAccess({
        ...makeAdmin("ADMIN"),
        team_role: teamRole,
      }),
    ).toThrow("CMO and CTO team accounts cannot access platform settings, plans, or databases.");
  });

  it("allows Admin and Super Admin accounts to access platform configuration", () => {
    expect(() => assertPlatformConfigurationAccess(makeAdmin("ADMIN"))).not.toThrow();
    expect(() => assertPlatformConfigurationAccess(makeAdmin("SUPER_ADMIN"))).not.toThrow();
  });

});
