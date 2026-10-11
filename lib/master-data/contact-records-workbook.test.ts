import * as XLSX from "xlsx";
import XlsxPopulate from "xlsx-populate";

import { describe, expect, it } from "vitest";

import { createContactWorkbook } from "@/lib/master-data/contact-records-workbook-generator";
import {
  parseContactWorkbook,
  type ContactWorkbookRecord,
} from "@/lib/master-data/contact-records-workbook-parser";

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
    console.log(result.failures);
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

  it("does not accept a supplied backend Contact Code or inactive status from a workbook", async () => {
    const result = await parseContactWorkbook(workbookFile([{
      name: "Contacts",
      rows: [
        ["Import Ref (auto - do not edit)", "Legal Name", "Roles", "Contact Code", "Active"],
        ["NEW-003", "New Contact", "VENDOR", "CT999", "FALSE"],
      ],
    }]));

    expect(result.failures).toEqual([]);
    expect(result.contacts[0].input).toMatchObject({
      legalName: "NEW CONTACT",
      roles: ["VENDOR"],
      isActive: true,
    });
    expect(result.contacts[0].input).not.toHaveProperty("code");
  });

  it("never exports full bank account numbers and provides dropdowns in populated and blank templates", async () => {
    const contact: ContactWorkbookRecord = {
      id: "contact-id",
      code: "CT1",
      legal_name: "Example Textiles",
      display_name: null,
      email: null,
      phone: null,
      is_active: true,
      roles: [{ role_code: "VENDOR" }],
      tax_registrations: [],
      addresses: [],
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
    const bankRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Bank Accounts"], {
      header: 1,
      defval: "",
      raw: false,
    });
    expect(bankRows[1][2]).toBe("");

    const populatedWorkbook = await XlsxPopulate.fromDataAsync(populatedBytes);
    expect(populatedWorkbook.sheet("Contacts").range("F2:F501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "ContactRoles",
    });
    expect(populatedWorkbook.sheet("GST Registrations").range("D2:D501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "RegistrationTypes",
    });
    expect(populatedWorkbook.sheet("Addresses").range("D2:D501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "AddressUsages",
    });
    expect(populatedWorkbook.sheet("Contacts").range("A1:F1").value()).toEqual([[
      "Import Ref (auto - do not edit)", "Legal Name", "Display Name", "Email", "Phone", "Roles",
    ]]);
    expect(populatedWorkbook.sheet("Contacts").cell("A2").value()).toBe("EXPORTED-00001");
    expect(populatedWorkbook.sheet("Contacts").range("A2:F2").value()).toEqual([[
      "EXPORTED-00001", "Example Textiles", undefined, undefined, undefined, "VENDOR",
    ]]);
    expect(populatedWorkbook.sheet("Addresses").range("K2:K501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "CountryCodes",
    });
    expect(populatedWorkbook.sheet("Bank Accounts").range("A2:A501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "ImportReferences",
    });

    const templateBytes = await createContactWorkbook([]);
    const templateWorkbook = XLSX.read(templateBytes, { type: "array" });
    const populatedTemplateWorkbook = await XlsxPopulate.fromDataAsync(templateBytes);
    const contactsRows = XLSX.utils.sheet_to_json<unknown[]>(templateWorkbook.Sheets.Contacts, {
      header: 1,
      defval: "",
    });
    expect(contactsRows).toHaveLength(501);
    expect(contactsRows[0]).toContain("Import Ref (auto - do not edit)");
    expect(contactsRows[0]).not.toContain("Contact Code");
    expect(contactsRows[0]).not.toContain("Active");
    expect(contactsRows[1][0]).toBe("NEW-001");
    expect(contactsRows[200][0]).toBe("NEW-200");
    expect(contactsRows.slice(1).every((row) => row.slice(1).every((value) => value === ""))).toBe(true);
    expect(populatedTemplateWorkbook.sheet("Contacts").range("F2:F501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "ContactRoles",
    });
    const templateFile = new File([templateBytes], "contacts.xlsx");
    await expect(parseContactWorkbook(templateFile)).rejects.toThrow("Enter at least one contact name and role");
  });
});
