import { describe, expect, it } from "vitest";

import {
  formatImportReportValue,
  getContactTemplateFieldValues,
  getImportReportFields,
  humanizeImportFieldName,
  isImportReportError,
} from "./master-import-report-format";

describe("master import report formatting", () => {
  it("uses human-readable headings and readable nested values instead of JSON", () => {
    expect(humanizeImportFieldName("taxRegistrationGstin")).toBe("Tax Registration GSTIN");
    expect(humanizeImportFieldName("addresses.0.stateCode")).toBe("Addresses / Row 1 / State Code");
    expect(formatImportReportValue([{
      addressLine1: "10 MAIN ROAD",
      stateCode: "19",
      postalCode: "734311",
    }])).toBe("1. Address Line 1: 10 MAIN ROAD\nState Code: 19\nPostal Code: 734311");
  });

  it("shows workbook input fields but excludes import-only metadata", () => {
    const fields = getImportReportFields({
      contactKey: "ROW-2",
      corrections: [{ field: "role" }],
      input: {
        legalName: "A COMPANY",
        addresses: [{
          city: "KOLKATA",
          addressLine1: "1 ROAD",
          stateCode: "19",
          isDefaultBilling: true,
        }],
        taxRegistrations: [{
          gstin: "19AAAAA0000A1Z1",
          legalName: "A COMPANY GST",
          registrationType: "REGULAR",
          status: "ACTIVE",
        }],
        roles: ["CUSTOMER", "VENDOR"],
      },
      validationErrors: [{ message: "invalid" }],
    });
    expect(Object.keys(fields)).toHaveLength(26);
    expect(fields).toMatchObject({
      "Legal Name": "A COMPANY",
      "Roles (optional; separate with semicolons)": "CUSTOMER; VENDOR",
      GSTIN: "19AAAAA0000A1Z1",
      "GST Registered Legal Name": "A COMPANY GST",
      City: "KOLKATA",
      "Address Line 1": "1 ROAD",
      "State Code": "19",
    });
    expect(fields).not.toHaveProperty("contactKey");
    expect(fields).not.toHaveProperty("corrections");
  });

  it("uses generic workbook template labels and child rows without backend wrapper headings", () => {
    expect(getImportReportFields({
      rowNumber: 2,
      code: "STYLE-1",
      description: "STYLE DESCRIPTION",
      fields: { name: "STYLE NAME" },
      childRows: { sizes: [{ size: "M", quantity: 4 }] },
      validationErrors: [],
    }, [{ key: "name", label: "Style Name" }, { key: "sizes", label: "Size Details" }]))
      .toEqual({
        "Style Name": "STYLE NAME",
        "Size Details": "1. Size: M\nQuantity: 4",
        "Master Code": "STYLE-1",
        Description: "STYLE DESCRIPTION",
      });
  });

  it("selects contact data for the same default rows as the contact download template", () => {
    expect(getContactTemplateFieldValues({
      legalName: "A COMPANY",
      displayName: "A DISPLAY",
      addresses: [
        { addressLine1: "SECONDARY", isDefaultBilling: false, isDefaultShipping: false },
        {
          addressLine1: "DEFAULT",
          taxRegistrationGstin: "LINKED",
          isDefaultBilling: true,
          isDefaultShipping: true,
        },
      ],
      taxRegistrations: [
        { gstin: "OTHER", status: "ACTIVE" },
        { gstin: "LINKED", status: "INACTIVE" },
      ],
      bankAccounts: [
        { accountNumber: "1234", isDefault: false },
        { accountNumber: "5678", isDefault: true },
      ],
    })).toMatchObject({
      "Legal Name": "A COMPANY",
      "Address Line 1": "DEFAULT",
      GSTIN: "LINKED",
      "Account Number": "5678",
    });
  });

  it("classifies validation and import failures in the Errors tab", () => {
    expect(isImportReportError("STAGED", "")).toBe(false);
    expect(isImportReportError("INVALID", "")).toBe(true);
    expect(isImportReportError("STAGED", "GSTIN is invalid")).toBe(true);
  });
});
