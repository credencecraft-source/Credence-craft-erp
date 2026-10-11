import * as XLSX from "xlsx";

import { describe, expect, it } from "vitest";

import {
  createContactWorkbook,
  parseContactWorkbook,
  type ContactWorkbookRecord,
} from "@/lib/master-data/contact-records-workbook";

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
          ["Contact Key", "Contact Code", "Legal Name", "Display Name", "Email", "Phone", "Roles", "Active"],
          ["NEW-001", "CT999", "Example Textiles", "Example", "ops@example.com", "9876543210", "CUSTOMER; VENDOR", "TRUE"],
        ],
      },
      {
        name: "GST Registrations",
        rows: [
          ["Contact Key", "GSTIN", "Registered Legal Name", "Registration Type", "Status"],
          ["NEW-001", "27AAPFU0939F1ZV", "Example Textiles", "REGULAR", "ACTIVE"],
        ],
      },
      {
        name: "Addresses",
        rows: [
          ["Contact Key", "GSTIN", "Label", "Use", "Address Line 1", "Address Line 2", "City", "State", "State Code", "PIN Code", "Country Code", "Default Billing", "Default Shipping"],
          ["NEW-001", "27AAPFU0939F1ZV", "Head Office", "BOTH", "1 Market Road", "", "Mumbai", "Maharashtra", "27", "400001", "IN", "TRUE", "TRUE"],
        ],
      },
      {
        name: "Bank Accounts",
        rows: [
          ["Contact Key", "Account Holder Name", "Account Number", "Account Last 4", "IFSC Code", "Bank Name", "Branch", "Default"],
          ["NEW-001", "Example Textiles", "12345678", "", "HDFC0001234", "HDFC Bank", "Mumbai", "TRUE"],
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

  it("blocks imported exported contact codes and invalid related bank rows", async () => {
    const existingCode = await parseContactWorkbook(workbookFile([{
      name: "Contacts",
      rows: [
        ["Contact Key", "Legal Name", "Roles"],
        ["CT1", "Existing Contact", "CUSTOMER"],
      ],
    }]));
    expect(existingCode.contacts).toHaveLength(0);
    expect(existingCode.failures[0].message).toContain("NEW-");

    const maskedBankNumber = await parseContactWorkbook(workbookFile([
      {
        name: "Contacts",
        rows: [["Contact Key", "Legal Name", "Roles"], ["NEW-002", "New Contact", "VENDOR"]],
      },
      {
        name: "Bank Accounts",
        rows: [
          ["Contact Key", "Account Holder Name", "Account Number", "IFSC Code", "Bank Name", "Default"],
          ["NEW-002", "New Contact", "•••• 5678", "HDFC0001234", "HDFC Bank", "TRUE"],
        ],
      },
    ]));
    expect(maskedBankNumber.contacts).toHaveLength(0);
    expect(maskedBankNumber.failures[0].message).toContain("full Account Number");
  });

  it("never exports full bank account numbers and provides a blank import template", () => {
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
    const workbook = XLSX.read(createContactWorkbook([contact]), { type: "array" });
    const bankRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Bank Accounts"], {
      header: 1,
      defval: "",
      raw: false,
    });
    expect(bankRows[1][2]).toBe("");
    expect(bankRows[1][3]).toBe("5678");

    const templateWorkbook = XLSX.read(createContactWorkbook([]), { type: "array" });
    const contactsRows = XLSX.utils.sheet_to_json<unknown[]>(templateWorkbook.Sheets.Contacts, {
      header: 1,
      defval: "",
    });
    expect(contactsRows).toHaveLength(1);
    expect(contactsRows[0]).toContain("Contact Key");
  });
});
