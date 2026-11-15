import { describe, expect, it } from "vitest";

import {
  formatIndianMobileNumber,
  getIndianMobileNumberLookupVariants,
  isValidIndianNationalMobileNumber,
  normalizeIndianMobileNumber,
} from "./indian-mobile-number";

describe("Indian mobile number normalization", () => {
  it("accepts only exactly 10 digits for Indian national-number input", () => {
    expect(isValidIndianNationalMobileNumber("9194711099")).toBe(true);
    expect(isValidIndianNationalMobileNumber("919471109")).toBe(false);
    expect(isValidIndianNationalMobileNumber("91947110999")).toBe(false);
  });

  it("adds the 91 country code and removes plus signs and formatting", () => {
    expect(normalizeIndianMobileNumber("+91 (98765) 43210")).toBe("919876543210");
    expect(normalizeIndianMobileNumber("9876543210")).toBe("919876543210");
    expect(normalizeIndianMobileNumber("09876543210")).toBe("919876543210");
  });

  it("rejects numbers that are not valid 12-digit Indian mobile numbers", () => {
    expect(() => normalizeIndianMobileNumber("12345")).toThrow("Mobile number must be 12 digits");
    expect(() => normalizeIndianMobileNumber("+1 415 555 2671")).toThrow("Mobile number must be 12 digits");
    expect(() => normalizeIndianMobileNumber("9198765432100")).toThrow("Mobile number must be 12 digits");
  });

  it("formats valid legacy values and preserves invalid historical values for review", () => {
    expect(formatIndianMobileNumber("+91 98765-43210")).toBe("919876543210");
    expect(formatIndianMobileNumber("12345")).toBe("12345");
    expect(formatIndianMobileNumber(null)).toBeNull();
  });

  it("provides common legacy forms for duplicate checks during imports", () => {
    expect(getIndianMobileNumberLookupVariants("9876543210")).toContain("+91 9876543210");
    expect(getIndianMobileNumberLookupVariants("9876543210")).toContain("9876543210");
  });
});
