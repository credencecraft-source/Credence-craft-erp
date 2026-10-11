import { describe, expect, it } from "vitest";

import {
  ContactValidationError,
  normalizeAndValidateGstin,
  parseContactInput,
} from "./contact-master-validation";

const validGstin = "27AAPFU0939F1ZV";

function baseContact(overrides: Record<string, unknown> = {}) {
  return {
    code: "ACME-01",
    legalName: "Acme Apparel Pvt Ltd",
    roles: ["CUSTOMER", "VENDOR"],
    taxRegistrations: [{
      gstin: validGstin.toLowerCase(),
      legalName: "Acme Apparel Pvt Ltd",
      registrationType: "REGULAR",
      status: "ACTIVE",
    }],
    addresses: [{
      taxRegistrationGstin: validGstin,
      usage: "BOTH",
      addressLine1: "Unit 1, Industrial Estate",
      city: "Mumbai",
      stateName: "Maharashtra",
      stateCode: "27",
      postalCode: "400001",
      countryCode: "IN",
      isDefaultBilling: true,
      isDefaultShipping: true,
    }],
    bankAccounts: [{
      accountHolderName: "Acme Apparel Pvt Ltd",
      accountNumber: "0012345678",
      ifscCode: "HDFC0001234",
      bankName: "HDFC Bank",
      isDefault: true,
    }],
    ...overrides,
  };
}

describe("contact master validation", () => {
  it("normalizes a GSTIN and extracts its GST state code", () => {
    expect(normalizeAndValidateGstin(validGstin.toLowerCase())).toEqual({
      gstin: validGstin,
      stateCode: "27",
    });
  });

  it("rejects invalid GSTIN structure, unknown state codes, and checksums", () => {
    expect(() => normalizeAndValidateGstin("27AAPFU0939F1Z")).toThrow(ContactValidationError);
    expect(() => normalizeAndValidateGstin("00AAPFU0939F1ZV")).toThrow(/recognized GST state code/);
    expect(() => normalizeAndValidateGstin("27AAPFU0939F1ZA")).toThrow(/checksum/);
  });

  it("accepts overlapping roles and matching registration/address state", () => {
    const contact = parseContactInput(baseContact());

    expect(contact.roles).toEqual(["CUSTOMER", "VENDOR"]);
    expect(contact.taxRegistrations?.[0].gstin).toBe(validGstin);
    expect(contact.addresses?.[0].stateCode).toBe("27");
  });

  it("allows creating a contact before assigning its roles", () => {
    const contact = parseContactInput(baseContact({ roles: [] }));

    expect(contact.roles).toEqual([]);
  });

  it("allows an address without a city", () => {
    const contact = parseContactInput(baseContact({
      addresses: [{
        ...baseContact().addresses[0],
        city: "",
      }],
    }));

    expect(contact.addresses?.[0].city).toBe("");
  });

  it("does not require a user-supplied contact code and rejects code changes", () => {
    expect(parseContactInput(baseContact({ code: undefined })).code).toBeUndefined();
    expect(parseContactInput(baseContact()).code).toBeUndefined();
    expect(() => parseContactInput({ code: "CT99" }, true)).toThrow(/assigned automatically/);
  });

  it("rejects an Indian address whose state differs from its GSTIN", () => {
    expect(() => parseContactInput(baseContact({
      addresses: [{
        ...baseContact().addresses[0],
        stateCode: "29",
      }],
    }))).toThrow(/must match the linked GSTIN state code/);
  });

  it("rejects default flags incompatible with address use and duplicate defaults", () => {
    expect(() => parseContactInput(baseContact({
      addresses: [{
        ...baseContact().addresses[0],
        usage: "SHIPPING",
        isDefaultBilling: true,
        isDefaultShipping: false,
      }],
    }))).toThrow(/shipping-only address/);

    expect(() => parseContactInput(baseContact({
      addresses: [
        baseContact().addresses[0],
        { ...baseContact().addresses[0], isDefaultShipping: false },
      ],
    }))).toThrow(/Only one default/);
  });

  it("rejects malformed IFSC and duplicate role values", () => {
    expect(() => parseContactInput(baseContact({
      bankAccounts: [{ ...baseContact().bankAccounts[0], ifscCode: "BADIFSC" }],
    }))).toThrow(/valid 11-character IFSC/);

    expect(() => parseContactInput(baseContact({ roles: ["VENDOR", "VENDOR"] }))).toThrow(/Duplicate contact roles/);
  });
});
