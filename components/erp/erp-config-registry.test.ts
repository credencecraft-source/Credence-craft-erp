import { describe, expect, it } from "vitest";

import {
  ERP_MODULES,
  getErpBusinessTypeDisplayName,
  getErpBusinessTypeRouteSegment,
  getErpModuleForOrganizationPath,
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
  it("orders the Admin modules as Masters, Challan Print Out, Barcode, Integrations, and Migration", () => {
    const admin = ERP_MODULES.find((module) => module.key === "admin");

    expect(admin?.children.map(({ label }) => label)).toEqual([
      "Masters",
      "Challan Print Out",
      "Barcode / QR Code",
      "Integrations",
      "Migration",
    ]);
  });

  it("places Barcode / QR Code under Admin while retaining its current routes", () => {
    const admin = ERP_MODULES.find((module) => module.key === "admin");
    const barcodeQrCode = admin?.children.find((child) => child.key === "barcode-qr-code");

    expect(ERP_MODULES.find((module) => module.key === "design-development")?.children)
      .not.toContainEqual(expect.objectContaining({ key: "barcode-qr-code" }));
    expect(barcodeQrCode?.href).toBe("/design-development/barcode-qr-code");
    expect(barcodeQrCode?.children?.map(({ label, href }) => [label, href])).toEqual([
      ["Page Setup", "/design-development/barcode-qr-code/page-setup"],
      ["Templates", "/design-development/barcode-qr-code/templates"],
      ["Print/Download", "/design-development/barcode-qr-code/print-download"],
    ]);
  });

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

describe("POS contact navigation", () => {
  it("opens the centralized contacts report within POS", () => {
    const pos = ERP_MODULES.find((module) => module.key === "pos");
    const contacts = pos?.children.find((child) => child.key === "vendor-customer");

    expect(contacts).toMatchObject({
      label: "Vendor/Customer",
      href: "/pos/vendor-customer",
    });
  });

  it("adds Offers to the POS sidebar at the offers route", () => {
    const pos = ERP_MODULES.find((module) => module.key === "pos");
    const offers = pos?.children.find((child) => child.key === "offers");

    expect(offers).toMatchObject({
      label: "Offers",
      pathSegment: "offers",
    });
  });

  it("adds Coupon Code to the POS sidebar at the coupon report route", () => {
    const pos = ERP_MODULES.find((module) => module.key === "pos");
    const coupons = pos?.children.find((child) => child.key === "coupon-code");

    expect(coupons).toMatchObject({
      label: "Coupon Code",
      pathSegment: "cupencode",
    });
  });
});

describe("organization route module resolution", () => {
  const organizationPath = "/dashboard/workspace/organizations/organization";

  it("resolves the ERP module from the open route instead of an unrelated business-type fallback", () => {
    expect(getErpModuleForOrganizationPath(
      `${organizationPath}/order-management/merchandising/order`,
      organizationPath,
    )?.key).toBe("order-management");
    expect(getErpModuleForOrganizationPath(
      `${organizationPath}/pos/quick-invoice`,
      organizationPath,
    )?.key).toBe("pos");
  });

  it("does not resolve routes outside an ERP module", () => {
    expect(getErpModuleForOrganizationPath(
      `${organizationPath}/support-tickets`,
      organizationPath,
    )).toBeNull();
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

describe("Inventory Management outward navigation", () => {
  it("places FG Issued beneath Outward", () => {
    const inventory = ERP_MODULES.find((module) => module.key === "inventory-management");
    const outward = inventory?.children.find((child) => child.key === "outward");

    expect(outward?.children).toContainEqual({
      key: "fg-issued",
      label: "FG Issued",
      pathSegment: "fg-issued",
    });
  });
});
