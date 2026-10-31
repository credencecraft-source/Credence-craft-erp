import { describe, expect, it } from "vitest";

import {
  getDisplayMobileNumber,
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

  it("shows the Indian country code separately from the 10-digit mobile number", () => {
    expect(splitStoredMobileNumber("919194711099")).toEqual({
      countryCode: "+91",
      nationalNumber: "9194711099",
    });
  });

  it("keeps an unrecognized legacy number intact instead of guessing its code", () => {
    expect(splitStoredMobileNumber("9876543210")).toEqual({
      countryCode: "",
      nationalNumber: "9876543210",
    });
  });

  it("does not split malformed Indian mobile numbers as valid country-code numbers", () => {
    expect(splitStoredMobileNumber("9191947110999")).toEqual({
      countryCode: "",
      nationalNumber: "9191947110999",
    });
  });

  it("displays the national number after removing a duplicated Indian country code", () => {
    expect(getDisplayMobileNumber("91919471110999")).toBe("9471110999");
    expect(splitStoredMobileNumber("91919471110999")).toEqual({
      countryCode: "+91",
      nationalNumber: "9471110999",
    });
  });

  it("does not display malformed long values as mobile numbers", () => {
    expect(getDisplayMobileNumber("9191947110999")).toBe("");
  });

  it("offers the selected default in the shared code suggestions", () => {
    expect(MOBILE_COUNTRY_CODE_OPTIONS[0]).toEqual({
      code: "+91",
      country: "India",
    });
  });
});
