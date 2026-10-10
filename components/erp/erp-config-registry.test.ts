import { describe, expect, it } from "vitest";

import {
  getErpBusinessTypeDisplayName,
  getErpBusinessTypeRouteSegment,
  getErpModuleForBusinessTypeName,
  isErpBusinessTypeRouteSegment,
} from "./erp-config-registry";

describe("Advance Booking module naming", () => {
  it("renames Distribution for display while preserving the existing business-type identity", () => {
    expect(getErpBusinessTypeDisplayName("Distribution")).toBe("Advance Booking");
    expect(getErpModuleForBusinessTypeName("Distribution")?.pathSegment).toBe("advance-booking");
    expect(getErpModuleForBusinessTypeName("Advance Booking")?.key).toBe("distribution");
  });

  it("uses the new business-type route segment and continues matching legacy segments", () => {
    expect(getErpBusinessTypeRouteSegment("Distribution")).toBe("advance-booking");
    expect(isErpBusinessTypeRouteSegment("Distribution", "advance-booking")).toBe(true);
    expect(isErpBusinessTypeRouteSegment("Distribution", "distribution")).toBe(true);
  });
});
