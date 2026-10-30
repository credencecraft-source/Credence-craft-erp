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

  it("places Order Form beneath Quotation in the requested order", () => {
    const distribution = ERP_MODULES.find((module) => module.key === "distribution");
    const quotation = distribution?.children.find((child) => child.key === "quotation");

    expect(quotation?.children?.map((child) => [child.label, child.href])).toEqual([
      ["Advance Booking", "/advance-booking/order/advance-booking"],
      ["Order Form", "/advance-booking/order/order-form"],
      ["Quotation", "/advance-booking/quotation"],
      ["Sales Order", "/advance-booking/sales-order"],
    ]);
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

describe("Asset Management module navigation", () => {
  it("registers Asset PO as a separate module and resolves its business type", () => {
    const assetManagement = ERP_MODULES.find((module) => module.key === "asset-management");

    expect(assetManagement).toMatchObject({
      label: "Asset Management",
      pathSegment: "asset-management",
      children: [
        {
          key: "asset-purchase",
          label: "Asset Purchase",
          pathSegment: "asset-purchase",
          children: [
            { key: "asset-purchase-order", label: "Asset Purchase Order", href: "/asset-management/asset-po/purchase-orders" },
            { key: "create-po", label: "Create PO", href: "/asset-management/asset-po/allocate-vendor" },
            { key: "asset-grn", label: "Asset GRN", href: "/asset-management/asset-grn/report" },
          ],
        },
        { key: "asset-inventory", label: "Asset Inventory", href: "/asset-management/asset-inventory" },
        {
          key: "preventive-maintenance",
          label: "Preventive Maintenance",
          pathSegment: "preventive-maintenance",
          href: "/asset-management/preventive-maintenance",
        },
      ],
    });
    const inventory = ERP_MODULES.find((module) => module.key === "inventory-management");
    const stock = inventory?.children.find((child) => child.key === "stock");

    expect(stock?.children?.some((child) => child.key === "assets-stock")).toBe(false);
    expect(getErpModuleForBusinessTypeName("Asset Management")?.key).toBe("asset-management");
  });
});
