import { describe, expect, it } from "vitest";
import { isLocationLimitReached, parseLocationLimit } from "./inventory-location-restriction-service";

describe("inventory segment Location limit", () => {
  it("accepts whole-number counts including zero and blank unlimited", () => {
    expect(parseLocationLimit("12")).toBe(12);
    expect(parseLocationLimit("0")).toBe(0);
    expect(parseLocationLimit("")).toBeNull();
  });

  it("rejects fractional, negative, and unsafe limits", () => {
    expect(() => parseLocationLimit("1.5")).toThrow();
    expect(() => parseLocationLimit("-1")).toThrow();
    expect(() => parseLocationLimit("2147483648")).toThrow();
  });

  it("blocks creation at the maximum count, not before it", () => {
    expect(isLocationLimitReached(1, 2)).toBe(false);
    expect(isLocationLimitReached(2, 2)).toBe(true);
    expect(isLocationLimitReached(500, null)).toBe(false);
  });
});