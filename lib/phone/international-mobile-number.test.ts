import { describe, expect, it } from "vitest";

import {
  isValidInternationalMobileNumber,
  normalizeInternationalMobileNumber,
} from "./international-mobile-number";

describe("international mobile number validation", () => {
  it("keeps the Indian country code while validating a 10-digit subscriber number", () => {
    expect(normalizeInternationalMobileNumber("919194711099")).toBe(
      "919194711099",
    );
    expect(isValidInternationalMobileNumber("+91 9194711099")).toBe(true);
  });

  it("rejects Indian numbers with an incorrect subscriber length", () => {
    expect(normalizeInternationalMobileNumber("9191947110999")).toBeNull();
    expect(normalizeInternationalMobileNumber("91919471109")).toBeNull();
  });

  it("rejects Indian subscriber numbers with an invalid first digit", () => {
    expect(normalizeInternationalMobileNumber("911194711099")).toBeNull();
  });

  it("continues to accept valid international numbers", () => {
    expect(normalizeInternationalMobileNumber("+1 (415) 555-2671")).toBe(
      "14155552671",
    );
  });

  it("rejects alphabetic characters instead of silently stripping them", () => {
    expect(normalizeInternationalMobileNumber("phone 919194711099")).toBeNull();
  });
});
