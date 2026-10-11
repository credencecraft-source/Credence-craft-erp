import XlsxPopulate, { type Sheet } from "xlsx-populate";

import {
  CONTACT_GST_REGISTRATION_STATUSES,
  CONTACT_GST_REGISTRATION_TYPES,
  CONTACT_GST_STATE_CODES,
} from "@/lib/services/master-data/contact-master-validation";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook-parser";

const CONTACT_TEMPLATE_ROWS = 200;
const CONTACT_COLUMNS = [
  "Contact Code (system-generated; do not edit)",
  "Legal Name *",
  "Display Name",
  "Email",
  "Phone",
  "Roles * (separate with semicolons)",
  "GSTIN",
  "GST Registered Legal Name",
  "GST Registration Type",
  "GST Registration Status",
  "Address Label",
  "Address Use",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "State Code",
  "PIN Code",
  "Country Code",
  "Default Billing",
  "Default Shipping",
  "Account Holder Name",
  "Account Number",
  "IFSC Code",
  "Bank Name",
  "Branch",
  "Default Bank Account",
];

function quoteList(values: readonly string[]) {
  return `"${values.join(",")}"`;
}

function columnName(index: number) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function defaultAddress(contact: ContactWorkbookRecord) {
  return contact.addresses.find((address) => address.is_default_billing)
    ?? contact.addresses.find((address) => address.is_default_shipping)
    ?? contact.addresses[0];
}

function registrationForAddress(contact: ContactWorkbookRecord, addressGstin?: string) {
  return (addressGstin ? contact.tax_registrations.find((registration) => registration.gstin === addressGstin) : undefined)
    ?? contact.tax_registrations.find((registration) => registration.status === "ACTIVE")
    ?? contact.tax_registrations[0];
}

function contactRow(contact: ContactWorkbookRecord) {
  const address = defaultAddress(contact);
  const registration = registrationForAddress(contact, address?.tax_registration?.gstin);
  const bank = contact.bank_accounts.find((account) => account.is_default) ?? contact.bank_accounts[0];

  return [
    contact.code,
    contact.legal_name,
    contact.display_name ?? "",
    contact.email ?? "",
    contact.phone ?? "",
    contact.roles.map((role) => role.role_code).join("; "),
    registration?.gstin ?? "",
    registration?.legal_name ?? "",
    registration?.registration_type ?? "",
    registration?.status ?? "",
    address?.label ?? "",
    address?.usage ?? "",
    address?.address_line_1 ?? "",
    address?.address_line_2 ?? "",
    address?.city ?? "",
    address?.state_name ?? "",
    address?.state_code ?? "",
    address?.postal_code ?? "",
    address?.country_code ?? "",
    address?.is_default_billing ? "TRUE" : "FALSE",
    address?.is_default_shipping ? "TRUE" : "FALSE",
    bank?.account_holder_name ?? "",
    "",
    bank?.ifsc_code ?? "",
    bank?.bank_name ?? "",
    bank?.branch ?? "",
    bank?.is_default ? "TRUE" : "FALSE",
  ];
}

function populateSheet(sheet: Sheet, rows: unknown[][]) {
  sheet.range(`A1:AA${rows.length}`).value(rows);
  sheet.range("A1:AA1").style({ bold: true });
  sheet.freezePanes(1, 0);
  CONTACT_COLUMNS.forEach((header, index) => {
    const column = columnName(index);
    sheet.column(column).width(Math.min(Math.max(header.length + 3, 16), 34));
  });
}

export async function createContactWorkbook(records: ContactWorkbookRecord[], _configuredRoles: string[] = []) {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const contactsSheet = workbook.sheet(0).name("Contacts");
  const isBlankTemplate = records.length === 0;
  const rows: unknown[][] = [
    CONTACT_COLUMNS,
    ...records.map(contactRow),
  ];

  if (isBlankTemplate) {
    for (let index = 0; index < CONTACT_TEMPLATE_ROWS; index += 1) {
      rows.push(Array(CONTACT_COLUMNS.length).fill(""));
    }
  }

  populateSheet(contactsSheet, rows);

  const lastTemplateRow = Math.max(CONTACT_TEMPLATE_ROWS + 1, rows.length);
  const roles = [...new Set([
    ..._configuredRoles,
    "CUSTOMER", "VENDOR", "AGENT", "DISTRIBUTOR", "DEALER",
  ])];
  const rolesFormula = quoteList(roles);
  if (rolesFormula.length <= 255) {
    contactsSheet.range(`F2:F${lastTemplateRow}`).dataValidation({
      type: "list",
      allowBlank: true,
      showErrorMessage: false,
      formula1: rolesFormula,
    });
  }
  contactsSheet.range(`I2:I${lastTemplateRow}`).dataValidation({
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    formula1: quoteList(CONTACT_GST_REGISTRATION_TYPES),
  });
  contactsSheet.range(`J2:J${lastTemplateRow}`).dataValidation({
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    formula1: quoteList(CONTACT_GST_REGISTRATION_STATUSES),
  });
  contactsSheet.range(`L2:L${lastTemplateRow}`).dataValidation({
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    formula1: quoteList(["BILLING", "SHIPPING", "BOTH"]),
  });
  for (const column of ["Q", "T", "U", "AA"]) {
    contactsSheet.range(`${column}2:${column}${lastTemplateRow}`).dataValidation({
      type: "list",
      allowBlank: true,
      showErrorMessage: false,
      formula1: quoteList(column === "Q" ? CONTACT_GST_STATE_CODES : ["TRUE", "FALSE"]),
    });
  }

  return workbook.outputAsync({ type: "arraybuffer" });
}
