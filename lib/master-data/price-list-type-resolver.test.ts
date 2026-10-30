import { describe, expect, it } from "vitest";

import { resolvePriceListType } from "./price-list-type-resolver";

describe("resolvePriceListType", () => {
  it("resolves a decoded type name", () => {
    expect(resolvePriceListType("Location Based")).toBe("Location Based");
  });

  it("resolves a percent-encoded type name", () => {
    expect(resolvePriceListType("Location%20Based")).toBe("Location Based");
  });

  it("rejects values outside the configured type list", () => {
    expect(resolvePriceListType("Unknown Type")).toBeNull();
  });
});
