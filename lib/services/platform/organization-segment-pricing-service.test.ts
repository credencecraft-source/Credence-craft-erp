import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { parseOrganizationSegmentPrice, resolveOrganizationSegmentPrice } from "./organization-segment-pricing-service";

describe("organization segment pricing", () => {
  it("accepts zero and currency values with at most two decimal places", () => {
    expect(parseOrganizationSegmentPrice("0").toFixed(2)).toBe("0.00");
    expect(parseOrganizationSegmentPrice("125.5").toFixed(2)).toBe("125.50");
  });

  it.each(["-1", "1.999", "10000000000", "", "1e3"]) (
    "rejects invalid price input %s",
    (value) => {
      expect(() => parseOrganizationSegmentPrice(value)).toThrow();
    },
  );

  it("uses the assigned version price when no organization snapshot exists", () => {
    const versionPrice = new Prisma.Decimal("100.00");
    expect(resolveOrganizationSegmentPrice(null, versionPrice)?.toFixed(2)).toBe("100.00");
  });

  it("uses an organization snapshot instead of later version price changes", () => {
    const snapshotPrice = new Prisma.Decimal("100.00");
    const laterVersionPrice = new Prisma.Decimal("120.00");
    expect(
      resolveOrganizationSegmentPrice({ snapshot_price: snapshotPrice, custom_price: null }, laterVersionPrice)?.toFixed(2),
    ).toBe("100.00");
  });

  it("uses custom price when set and the snapshot after reset", () => {
    const snapshotPrice = new Prisma.Decimal("100.00");
    const customPrice = new Prisma.Decimal("85.00");
    const versionPrice = new Prisma.Decimal("120.00");

    expect(
      resolveOrganizationSegmentPrice({ snapshot_price: snapshotPrice, custom_price: customPrice }, versionPrice)?.toFixed(2),
    ).toBe("85.00");
    expect(
      resolveOrganizationSegmentPrice({ snapshot_price: snapshotPrice, custom_price: null }, versionPrice)?.toFixed(2),
    ).toBe("100.00");
  });
});