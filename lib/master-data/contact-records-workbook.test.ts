import * as XLSX from "xlsx";
import XlsxPopulate from "xlsx-populate";

import { describe, expect, it } from "vitest";

import { createContactWorkbook } from "@/lib/master-data/contact-records-workbook-generator";
import {
  parseContactWorkbook,
  type ContactWorkbookRecord,
} from "@/lib/master-data/contact-records-workbook-parser";
import { CONTACT_GST_REGISTRATION_TYPES } from "@/lib/services/master-data/contact-master-validation";

function workbookFile(sheets: Array<{ name: string; rows: unknown[][] }>) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  return new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "contacts.xlsx");
}

describe("contact master workbook", () => {
  it("imports related GST, address, and bank sheets by NEW contact key", async () => {
    const file = workbookFile([
      {
        name: "Contacts",
        rows: [
          ["Import Ref (auto - do not edit)", "Legal Name", "Display Name", "Email", "Phone", "Roles"],
          ["NEW-001", "Example Textiles", "Example", "ops@example.com", "9876543210", "CUSTOMER; VENDOR"],
        ],
      },
      {
        name: "GST Registrations",
        rows: [
          ["Import Ref (auto - do not edit)", "GSTIN", "Registered Legal Name", "Registration Type", "Status"],
          ["NEW-001", "27AAPFU0939F1ZV", "Example Textiles", "REGULAR", "ACTIVE"],
        ],
      },
      {
        name: "Addresses",
        rows: [
          ["Import Ref (auto - do not edit)", "GSTIN", "Label", "Use", "Address Line 1", "Address Line 2", "City", "State", "State Code", "PIN Code", "Country Code", "Default Billing", "Default Shipping"],
          ["NEW-001", "27AAPFU0939F1ZV", "Head Office", "BOTH", "1 Market Road", "", "Mumbai", "Maharashtra", "27", "400001", "IN", "TRUE", "TRUE"],
        ],
      },
      {
        name: "Bank Accounts",
        rows: [
          ["Import Ref (auto - do not edit)", "Account Holder Name", "Account Number", "IFSC Code", "Bank Name", "Branch", "Default"],
          ["NEW-001", "Example Textiles", "12345678", "HDFC0001234", "HDFC Bank", "Mumbai", "TRUE"],
        ],
      },
    ]);

    const result = await parseContactWorkbook(file);
    expect(result.failures).toEqual([]);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].contactKey).toBe("NEW-001");
    expect(result.contacts[0].input).toEqual({
      legalName: "EXAMPLE TEXTILES",
      displayName: "EXAMPLE",
      email: "OPS@EXAMPLE.COM",
      phone: "9876543210",
      isActive: true,
      roles: ["CUSTOMER", "VENDOR"],
      taxRegistrations: [{
        gstin: "27AAPFU0939F1ZV",
        legalName: "EXAMPLE TEXTILES",
        registrationType: "REGULAR",
        status: "ACTIVE",
      }],
      addresses: [{
        taxRegistrationGstin: "27AAPFU0939F1ZV",
        label: "HEAD OFFICE",
        usage: "BOTH",
        addressLine1: "1 MARKET ROAD",
        addressLine2: null,
        city: "MUMBAI",
        stateName: "MAHARASHTRA",
        stateCode: "27",
        postalCode: "400001",
        countryCode: "IN",
        isDefaultBilling: true,
        isDefaultShipping: true,
      }],
      bankAccounts: [{
        accountHolderName: "EXAMPLE TEXTILES",
        accountNumber: "12345678",
        ifscCode: "HDFC0001234",
        bankName: "HDFC BANK",
        branch: "MUMBAI",
        isDefault: true,
      }],
    });
  });

  it("blocks existing export references and invalid related bank rows", async () => {
    const existingCode = await parseContactWorkbook(workbookFile([{
      name: "Contacts",
      rows: [
        ["Import Ref (auto - do not edit)", "Legal Name", "Roles"],
        ["EXPORTED-00001", "Existing Contact", "CUSTOMER"],
      ],
    }]));
    expect(existingCode.contacts).toHaveLength(0);
    expect(existingCode.failures[0].message).toContain("blank template");

    const maskedBankNumber = await parseContactWorkbook(workbookFile([
      {
        name: "Contacts",
        rows: [["Import Ref (auto - do not edit)", "Legal Name", "Roles"], ["NEW-002", "New Contact", "VENDOR"]],
      },
      {
        name: "Bank Accounts",
        rows: [
          ["Import Ref (auto - do not edit)", "Account Holder Name", "Account Number", "IFSC Code", "Bank Name", "Default"],
          ["NEW-002", "New Contact", "•••• 5678", "HDFC0001234", "HDFC Bank", "TRUE"],
        ],
      },
    ]));
    expect(maskedBankNumber.contacts).toHaveLength(0);
    expect(maskedBankNumber.failures[0].message).toContain("full Account Number");
  });

  it("rejects populated contact exports so they cannot be re-imported as new records", async () => {
    const result = await parseContactWorkbook(workbookFile([{
      name: "Contacts",
      rows: [
        ["Contact Code (system-generated; do not edit)", "Legal Name *", "Roles *"],
        ["CT999", "New Contact", "VENDOR"],
      ],
    }]));

    expect(result.contacts).toEqual([]);
    expect(result.failures[0].message).toContain("Use the blank template");
  });

  it("imports a complete contact row from the single-sheet template", async () => {
    const result = await parseContactWorkbook(workbookFile([{
      name: "Contacts",
      rows: [
        [
          "Legal Name *", "Display Name", "Email", "Phone", "Roles *",
          "GSTIN", "GST Registered Legal Name", "GST Registration Type", "GST Registration Status",
          "Address Label", "Address Use", "Address Line 1", "Address Line 2", "City", "State", "State Code",
          "PIN Code", "Country Code", "Default Billing", "Default Shipping", "Account Holder Name", "Account Number",
          "IFSC Code", "Bank Name", "Branch", "Default Bank Account",
        ],
        [
          "Example Textiles", "Example", "ops@example.com", "9876543210", "customer / vendor",
          "27AAPFU0939F1ZV", "Example Textiles", "REGULAR", "ACTIVE",
          "Head Office", "BOTH", "1 Market Road", "", "Mumbai", "Maharashtra", "27",
          "400001", "IN", "", "", "Example Textiles", "12345678",
          "HDFC0001234", "HDFC Bank", "Mumbai", "",
        ],
      ],
    }]));

    expect(result.failures).toEqual([]);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].contactKey).toBe("ROW-2");
    expect(result.corrections).toEqual([
      { contactKey: "ROW-2", field: "Roles", original: "customer", corrected: "CUSTOMER" },
      { contactKey: "ROW-2", field: "Roles", original: "vendor", corrected: "VENDOR" },
    ]);
    expect(result.contacts[0].input).toMatchObject({
      legalName: "EXAMPLE TEXTILES",
      displayName: "EXAMPLE",
      roles: ["CUSTOMER", "VENDOR"],
      taxRegistrations: [{
        gstin: "27AAPFU0939F1ZV",
        legalName: "EXAMPLE TEXTILES",
        registrationType: "REGULAR",
        status: "ACTIVE",
      }],
      addresses: [{
        taxRegistrationGstin: "27AAPFU0939F1ZV",
        usage: "BOTH",
        stateCode: "27",
        isDefaultBilling: true,
        isDefaultShipping: true,
      }],
      bankAccounts: [{
        accountHolderName: "EXAMPLE TEXTILES",
        accountNumber: "12345678",
        ifscCode: "HDFC0001234",
        isDefault: true,
      }],
    });
    expect(result.contacts[0].input).not.toHaveProperty("code");
  });

  it("rejects a primary GSTIN whose state does not match the address", async () => {
    const result = await parseContactWorkbook(workbookFile([{
      name: "Contacts",
      rows: [
        ["Legal Name *", "Roles *", "GSTIN", "Address Use", "Address Line 1", "City", "State", "State Code", "PIN Code"],
        ["Example Textiles", "VENDOR", "27AAPFU0939F1ZV", "BOTH", "1 Market Road", "Mumbai", "Maharashtra", "29", "400001"],
      ],
    }]));

    expect(result.contacts).toEqual([]);
    expect(result.failures[0].message).toContain("Address state code must match");
  });

  it("exports only one worksheet, keeps account numbers masked, and provides inline dropdowns", async () => {
    const contact: ContactWorkbookRecord = {
      id: "contact-id",
      code: "CT1",
      legal_name: "Example Textiles",
      display_name: null,
      email: null,
      phone: null,
      is_active: true,
      roles: [{ role_code: "VENDOR" }],
      tax_registrations: [{
        gstin: "27AAPFU0939F1ZV",
        legal_name: "Example Textiles",
        registration_type: "REGULAR",
        status: "ACTIVE",
      }],
      addresses: [{
        id: "address-id",
        tax_registration: { gstin: "27AAPFU0939F1ZV" },
        label: "Head Office",
        usage: "BOTH",
        address_line_1: "1 Market Road",
        address_line_2: null,
        city: "Mumbai",
        state_name: "Maharashtra",
        state_code: "27",
        postal_code: "400001",
        country_code: "IN",
        is_default_billing: true,
        is_default_shipping: true,
      }],
      bank_accounts: [{
        id: "bank-id",
        account_holder_name: "Example Textiles",
        account_number_masked: "•••• 5678",
        ifsc_code: "HDFC0001234",
        bank_name: "HDFC Bank",
        branch: null,
        is_default: true,
      }],
    };
    const populatedBytes = await createContactWorkbook([contact]);
    const workbook = XLSX.read(populatedBytes, { type: "array" });
    expect(workbook.SheetNames).toEqual(["Contacts"]);
    const contactRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Contacts, {
      header: 1,
      defval: "",
      raw: false,
    });
    expect(contactRows.filter((row) => row.some((value) => value !== ""))).toHaveLength(2);
    expect(contactRows[0]).not.toContain("Contact Code");
    expect(contactRows[1][0]).toBe("Example Textiles");
    expect(contactRows[1][5]).toBe("27AAPFU0939F1ZV");
    expect(contactRows[1][11]).toBe("1 Market Road");
    expect(contactRows[1][21]).toBe("");

    const populatedWorkbook = await XlsxPopulate.fromDataAsync(populatedBytes);
    expect(populatedWorkbook.sheet("Contacts").range("H2:H201").dataValidation()).toMatchObject({
      type: "list",
      formula1: `"${CONTACT_GST_REGISTRATION_TYPES.join(",")}"`,
    });
    expect(populatedWorkbook.sheet("Contacts").range("E2:E201").dataValidation()).toMatchObject({
      type: "list",
      formula1: '"CUSTOMER,VENDOR,AGENT,DISTRIBUTOR,DEALER"',
    });
    expect(populatedWorkbook.sheet("Contacts").range("K2:K201").dataValidation()).toMatchObject({
      type: "list",
      formula1: '"BILLING,SHIPPING,BOTH"',
    });

    const templateBytes = await createContactWorkbook([]);
    const templateWorkbook = XLSX.read(templateBytes, { type: "array" });
    const populatedTemplateWorkbook = await XlsxPopulate.fromDataAsync(templateBytes);
    const templateRows = XLSX.utils.sheet_to_json<unknown[]>(templateWorkbook.Sheets.Contacts, {
      header: 1,
      defval: "",
    });
    expect(templateWorkbook.SheetNames).toEqual(["Contacts"]);
    expect(templateRows).toHaveLength(201);
    expect(templateRows[0]).toContain("Legal Name *");
    expect(templateRows[0]).toContain("GSTIN");
    expect(templateRows[0]).toContain("Account Number");
    expect(templateRows[0]).not.toContain("Contact Code");
    expect(templateRows.slice(1).every((row) => row.every((value) => value === ""))).toBe(true);
    expect(populatedTemplateWorkbook.sheet("Contacts").range("H2:H201").dataValidation()).toMatchObject({
      type: "list",
      formula1: `"${CONTACT_GST_REGISTRATION_TYPES.join(",")}"`,
    });
    const templateFile = new File([templateBytes], "contacts.xlsx");
    await expect(parseContactWorkbook(templateFile)).rejects.toThrow("Enter at least one contact name and role");
  });
});
