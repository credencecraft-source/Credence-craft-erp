import { describe, expect, it } from "vitest";

import { normalizeUppercase } from "./text-case";

describe("normalizeUppercase", () => {
  it("uppercases all letters", () => {
    expect(normalizeUppercase("aPPLE printed shirt")).toBe("APPLE PRINTED SHIRT");
  });

  it("preserves whitespace and punctuation", () => {
    expect(normalizeUppercase("  (aPPLE)")).toBe("  (APPLE)");
  });

  it("supports Unicode letters", () => {
    expect(normalizeUppercase("straße")).toBe("STRASSE");
  });
});
