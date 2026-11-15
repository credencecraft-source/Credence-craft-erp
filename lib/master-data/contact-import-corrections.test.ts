import { describe, expect, it } from "vitest";

import {
  applyContactCorrection,
  createContactCorrectionRow,
  getContactCorrectionErrorFields,
} from "@/lib/master-data/contact-import-corrections";
import {
  ContactValidationError,
  type ContactInput,
} from "@/lib/services/master-data/contact-master-validation";

describe("contact import corrections", () => {
  it("shows readable fields without exposing bank numbers or serialized objects", () => {
    const input: ContactInput = {
      legalName: "Example Textiles",
      displayName: "Example",
      email: "invalid-email",
      isActive: true,
      roles: ["VENDOR"],
      taxRegistrations: [{
        gstin: "27AAPFU0939F1ZV",
        legalName: "Example Textiles",
        registrationType: "REGULAR",
        status: "ACTIVE",
      }],
      addresses: [{
        id: "internal-address-id",
        taxRegistrationGstin: "27AAPFU0939F1ZV",
        usage: "BOTH",
        addressLine1: "1 Market Road",
        city: "Mumbai",
        stateName: "Maharashtra",
        stateCode: "29",
        postalCode: "40000",
        countryCode: "IN",
        isDefaultBilling: true,
        isDefaultShipping: true,
      }],
      bankAccounts: [{
        id: "internal-bank-id",
        accountHolderName: "Example Textiles",
        accountNumber: "1234567890",
        ifscCode: "HDFC0001234",
        bankName: "HDFC Bank",
        branch: "Mumbai",
        isDefault: true,
      }],
    };

    const row = createContactCorrectionRow(
      "ROW-460",
      input,
      "Address state code must match the linked GSTIN state code.",
      ["addresses.0.stateCode", "addresses.0.taxRegistrationGstin", "taxRegistrations.0.gstin"],
    );

    expect(row.identity).toContain("Example");
    expect(row.identity).toContain("spreadsheet row 460");
    expect(row.values).not.toContain("1234567890");
    expect(JSON.stringify(row)).not.toContain("internal-address-id");
    expect(JSON.stringify(row)).not.toContain("internal-bank-id");
    expect(row.values).not.toHaveProperty("taxRegistrations");
    expect(row.values).not.toHaveProperty("addresses");
    expect(row.values).not.toHaveProperty("bankAccounts");
    expect(row.fields?.map((field) => field.label)).toContain("State Code 1");
    expect(row.errors).toHaveProperty("addressStateCode_0");
  });

  it("revalidates corrected email, GST state, PIN, and retains an undisplayed bank number", () => {
    const input: ContactInput = {
      legalName: "Example Textiles",
      email: "invalid-email",
      isActive: true,
      roles: ["VENDOR"],
      taxRegistrations: [{
        gstin: "27AAPFU0939F1ZV",
        legalName: "Example Textiles",
        registrationType: "REGULAR",
        status: "ACTIVE",
      }],
      addresses: [{
        taxRegistrationGstin: "27AAPFU0939F1ZV",
        usage: "BOTH",
        addressLine1: "1 Market Road",
        city: "Mumbai",
        stateName: "Maharashtra",
        stateCode: "29",
        postalCode: "40000",
        countryCode: "IN",
        isDefaultBilling: true,
        isDefaultShipping: true,
      }],
      bankAccounts: [{
        accountHolderName: "Example Textiles",
        accountNumber: "1234567890",
        ifscCode: "HDFC0001234",
        bankName: "HDFC Bank",
        branch: "Mumbai",
        isDefault: true,
      }],
    };

    const corrected = applyContactCorrection(input, {
      legalName: "Example Textiles",
      displayName: "",
      email: "ops@example.com",
      phone: "",
      roles: "VENDOR",
      gstin_0: "27AAPFU0939F1ZV",
      registrationLegalName_0: "Example Textiles",
      registrationType_0: "REGULAR",
      registrationStatus_0: "ACTIVE",
      addressGstin_0: "27AAPFU0939F1ZV",
      addressLabel_0: "",
      addressUse_0: "BOTH",
      addressLine1_0: "1 Market Road",
      addressLine2_0: "",
      addressCity_0: "Mumbai",
      addressState_0: "Maharashtra",
      addressStateCode_0: "27",
      addressPinCode_0: "400001",
      addressCountryCode_0: "IN",
      addressDefaultBilling_0: "true",
      addressDefaultShipping_0: "true",
      bankAccountHolder_0: "Example Textiles",
      accountNumber_0: "",
      bankIfsc_0: "HDFC0001234",
      bankName_0: "HDFC Bank",
      bankBranch_0: "Mumbai",
      bankDefault_0: "true",
    });

    expect(corrected.email).toBe("OPS@EXAMPLE.COM");
    expect(corrected.addresses[0].stateCode).toBe("27");
    expect(corrected.addresses[0].postalCode).toBe("400001");
    expect(corrected.bankAccounts[0].accountNumber).toBe("1234567890");
  });

  it("associates GSTIN errors with GSTIN and cross-field state errors with both related values", () => {
    const input: ContactInput = {
      legalName: "Example Textiles",
      isActive: true,
      roles: [],
      taxRegistrations: [{
        gstin: "27AAPFU0939F1ZV",
        legalName: "",
        registrationType: "REGULAR",
        status: "ACTIVE",
      }],
      addresses: [{
        taxRegistrationGstin: "27AAPFU0939F1ZV",
        usage: "BOTH",
        addressLine1: "1 Market Road",
        city: "Mumbai",
        stateName: "Maharashtra",
        stateCode: "29",
        postalCode: "400001",
        countryCode: "IN",
        isDefaultBilling: false,
        isDefaultShipping: false,
      }],
      bankAccounts: [],
    };
    expect(getContactCorrectionErrorFields(["taxRegistrations.0.gstin"], input)).toEqual(["gstin_0"]);
    expect(getContactCorrectionErrorFields(["addresses.0.stateCode"], input)).toEqual(["addressStateCode_0"]);
    expect(getContactCorrectionErrorFields([
      "addresses.0.stateCode",
      "addresses.0.taxRegistrationGstin",
      "taxRegistrations.0.gstin",
    ], input)).toEqual(["addressStateCode_0", "addressGstin_0", "gstin_0"]);
    expect(getContactCorrectionErrorFields([
      "addresses.0.taxRegistrationGstin",
      "taxRegistrations",
    ], input)).toEqual(["addressGstin_0", "gstin_0"]);
  });

  it("explains which linked GSTIN fields caused a validation error after GSTIN is cleared", () => {
    const input: ContactInput = {
      legalName: "Example Textiles",
      isActive: true,
      roles: ["VENDOR"],
      taxRegistrations: [{
        gstin: "27AAPFU0939F1ZV",
        legalName: "Example Textiles",
        registrationType: "REGULAR",
        status: "ACTIVE",
      }],
      addresses: [{
        taxRegistrationGstin: "27AAPFU0939F1ZV",
        usage: "BOTH",
        addressLine1: "1 Market Road",
        city: "Mumbai",
        stateName: "Maharashtra",
        stateCode: "27",
        postalCode: "400001",
        countryCode: "IN",
        isDefaultBilling: true,
        isDefaultShipping: true,
      }],
      bankAccounts: [],
    };
    const correction = createContactCorrectionRow(
      "ROW-1204",
      input,
      "GSTIN checksum is invalid.",
      ["addresses.0.taxRegistrationGstin", "taxRegistrations"],
    );

    let validationError: unknown;
    try {
      applyContactCorrection(input, {
      ...correction.values,
      gstin_0: "",
      });
    } catch (error) {
      validationError = error;
    }
    expect(validationError).toBeInstanceOf(ContactValidationError);
    expect((validationError as ContactValidationError).fieldPaths).toEqual([
      "addresses.0.taxRegistrationGstin",
      "taxRegistrations",
    ]);
    expect(getContactCorrectionErrorFields(
      (validationError as ContactValidationError).fieldPaths,
      input,
    )).toEqual(["addressGstin_0", "gstin_0"]);
  });
});
