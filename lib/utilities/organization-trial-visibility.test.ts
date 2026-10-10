import { describe, expect, it } from "vitest";
import {
  isOrganizationTrialInactive,
  shouldBlockOrganizationForUserPricing,
} from "./organization-trial-visibility";

describe("organization trial pricing visibility", () => {
  const now = Date.parse("2026-10-06T10:00:00.000Z");

  it("treats a disabled or missing trial as inactive", () => {
    expect(isOrganizationTrialInactive(false, null, null, now)).toBe(true);
    expect(isOrganizationTrialInactive(true, null, null, now)).toBe(true);
  });

  it("treats an expired trial as inactive", () => {
    expect(isOrganizationTrialInactive(
      true,
      "2026-10-05T10:00:00.000Z",
      "2026-10-06T09:59:59.000Z",
      now,
    )).toBe(true);
  });

  it("does not treat an active trial as inactive", () => {
    expect(isOrganizationTrialInactive(
      true,
      "2026-10-06T09:00:00.000Z",
      "2026-10-06T11:00:00.000Z",
      now,
    )).toBe(false);
  });

  it("requires pricing only for configured User Based organizations without trial or subscription access", () => {
    expect(shouldBlockOrganizationForUserPricing("USER_BASED", true, false)).toBe(true);
    expect(shouldBlockOrganizationForUserPricing("USER_BASED", true, true)).toBe(false);
    expect(shouldBlockOrganizationForUserPricing("USER_BASED", false, false)).toBe(false);
    expect(shouldBlockOrganizationForUserPricing("MODULE_BASED", true, false)).toBe(false);
  });
});
