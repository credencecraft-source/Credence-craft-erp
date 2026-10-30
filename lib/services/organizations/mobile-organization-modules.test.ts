import { describe, expect, it } from "vitest";

import { getMobileOrganizationModules } from "./mobile-organization-modules";

describe("mobile organization module navigation", () => {
  it("matches the web module switcher labels and sidebar tree", () => {
    const modules = getMobileOrganizationModules([
      { id: "distribution-id", name: "Distribution" },
      { id: "inventory-id", name: "Inventory Management" },
    ]);

    expect(modules.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "distribution-id", label: "Advance Booking" },
      { key: "inventory-id", label: "Inventory Management" },
    ]);
    expect(modules[0].pathSegment).toBe("advance-booking");
    expect(modules[0].children).toEqual([
      {
        key: "quotation",
        label: "Quotation",
        href: "/advance-booking",
        children: [
          {
            key: "advance-booking",
            label: "Advance Booking",
            href: "/advance-booking/order/advance-booking",
          },
          {
            key: "order-form",
            label: "Order Form",
            href: "/advance-booking/order/order-form",
          },
          {
            key: "quotation",
            label: "Quotation",
            href: "/advance-booking/quotation",
          },
          {
            key: "master-quotation",
            label: "Sales Order",
            href: "/advance-booking/sales-order",
          },
        ],
      },
      {
        key: "asn",
        label: "ASN",
        href: "/advance-booking",
        children: [
          {
            key: "fulfillment",
            label: "Allocate Bookings",
            href: "/advance-booking/fulfillment",
          },
          {
            key: "shipment-tracking",
            label: "Shipment Tracking",
            href: "/advance-booking/shipment-tracking",
          },
        ],
      },
    ]);
    expect(modules[1].children.some(({ label }) => label === "Raw Material")).toBe(false);
  });

  it("omits business types with no web ERP module and returns an empty list when none are configured", () => {
    expect(
      getMobileOrganizationModules([
        { id: "custom-id", name: "Custom Business Type" },
      ]),
    ).toEqual([]);
    expect(getMobileOrganizationModules([])).toEqual([]);
  });
});
