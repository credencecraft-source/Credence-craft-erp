import { describe, expect, it } from "vitest";
import {
  buildPersistedOrderVariantCode,
  buildStyleColorVariantCode,
  MAX_VARIANT_CODE_LENGTH,
} from "./finished-goods-variant-code";

describe("order variant code", () => {
  it("normalizes the order Style Name and Colour and returns null when either is missing", () => {
    expect(buildPersistedOrderVariantCode("Oxford Shirt", "Navy Blue"))
      .toBe("OXFORD-SHIRT-NAVY-BLUE");
    expect(buildPersistedOrderVariantCode("Oxford Shirt", null)).toBeNull();
  });

  it("rejects normalized order codes that exceed the persisted column limit", () => {
    expect(buildStyleColorVariantCode("A".repeat(60), "B".repeat(50))?.length)
      .toBeGreaterThan(MAX_VARIANT_CODE_LENGTH);
    expect(() => buildPersistedOrderVariantCode("A".repeat(60), "B".repeat(50)))
      .toThrow(`Style Name and Colour produce a Variant Code longer than ${MAX_VARIANT_CODE_LENGTH} characters.`);
  });
});
