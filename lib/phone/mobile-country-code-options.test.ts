import { describe, expect, it } from "vitest";

import {
  MOBILE_COUNTRY_CODE_OPTIONS,
  splitStoredMobileNumber,
} from "./mobile-country-code-options";

describe("mobile country-code options", () => {
  it("defaults a new phone field to India's country code", () => {
    expect(splitStoredMobileNumber(null)).toEqual({
      countryCode: "+91",
      nationalNumber: "",
    });
  });

  it("splits a stored international number into country code and local number", () => {
    expect(splitStoredMobileNumber("919123456789")).toEqual({
      countryCode: "+91",
      nationalNumber: "9123456789",
    });
  });

  it("keeps an unrecognized legacy number intact instead of guessing its code", () => {
    expect(splitStoredMobileNumber("9876543210")).toEqual({
      countryCode: "",
      nationalNumber: "9876543210",
    });
  });

  it("offers the selected default in the shared code suggestions", () => {
    expect(MOBILE_COUNTRY_CODE_OPTIONS[0]).toEqual({
      code: "+91",
      country: "India",
    });
  });
});
