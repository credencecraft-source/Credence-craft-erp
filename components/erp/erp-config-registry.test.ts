import { describe, expect, it } from "vitest";

import {
  ERP_MODULES,
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

describe("Admin module navigation", () => {
  it("places Excel, Direct, and Import History beneath Admin > Migration", () => {
    const admin = ERP_MODULES.find((module) => module.key === "admin");
    const migration = admin?.children.find((child) => child.key === "migration");

    expect(migration).toMatchObject({
      label: "Migration",
      pathSegment: "migration",
    });
    expect(migration?.children).toEqual([
      { key: "excel", label: "Via Excel", pathSegment: "excel" },
      { key: "direct", label: "Direct", pathSegment: "direct" },
      { key: "import-history", label: "Import History", pathSegment: "import-history" },
    ]);
  });
});
