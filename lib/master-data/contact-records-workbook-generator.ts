import XlsxPopulate, { type Sheet, type Workbook } from "xlsx-populate";

import {
  CONTACT_GST_REGISTRATION_STATUSES,
  CONTACT_GST_REGISTRATION_TYPES,
  CONTACT_GST_STATE_CODES,
} from "@/lib/services/master-data/contact-master-validation";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook-parser";

const CONTACT_TEMPLATE_ROWS = 500;
const CONTACT_IMPORT_LIMIT = 200;

function columnName(index: number) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function uniqueValues(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function setRows(sheet: Sheet, rows: unknown[][], lastColumn: number) {
  sheet.range(`A1:${columnName(lastColumn)}${rows.length}`).value(rows);
  sheet.range(`A1:${columnName(lastColumn)}1`).style({ bold: true });
  sheet.freezePanes(1, 0);
  const headers = rows[0] ?? [];
  headers.forEach((header, index) => {
    sheet.column(columnName(index + 1)).width(Math.max(String(header).length + 3, 16));
  });
}

function addContactList(
  workbook: Workbook,
  optionsSheet: Sheet,
  columnIndex: number,
  rangeName: string,
  values: readonly string[],
) {
  const list = uniqueValues(values);
  const column = columnName(columnIndex);
  optionsSheet.cell(`${column}1`).value(rangeName);
  if (!list.length) return false;
  optionsSheet.range(`${column}2:${column}${list.length + 1}`).value(list.map((value) => [value]));
  workbook.definedName(rangeName, optionsSheet.range(`${column}2:${column}${list.length + 1}`));
  return true;
}

function addContactDropdown(sheet: Sheet, column: string, lastRow: number, rangeName: string) {
  sheet.range(`${column}2:${column}${lastRow}`).dataValidation({
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    formula1: rangeName,
  });
}

export async function createContactWorkbook(records: ContactWorkbookRecord[], configuredRoles: string[] = []) {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const contactsSheet = workbook.sheet(0).name("Contacts");
  const registrationsSheet = workbook.addSheet("GST Registrations");
  const addressesSheet = workbook.addSheet("Addresses");
  const banksSheet = workbook.addSheet("Bank Accounts");
  const instructionsSheet = workbook.addSheet("Instructions");
  const optionsSheet = workbook.addSheet("Options");
  const isBlankTemplate = records.length === 0;
  const importReferences = records.map((_, index) => `EXPORTED-${String(index + 1).padStart(5, "0")}`);
  if (isBlankTemplate) {
    importReferences.push(...Array.from({ length: CONTACT_IMPORT_LIMIT }, (_, index) =>
      `NEW-${String(index + 1).padStart(3, "0")}`,
    ));
  }
  const contacts = [
    ["Import Ref (auto - do not edit)", "Legal Name", "Display Name", "Email", "Phone", "Roles"],
    ...records.map((contact, index) => [
      importReferences[index],
      contact.legal_name,
      contact.display_name ?? "",
      contact.email ?? "",
      contact.phone ?? "",
      contact.roles.map((role) => role.role_code).join("; "),
    ]),
    ...(isBlankTemplate ? importReferences.map((reference) => [reference, "", "", "", "", ""]) : []),
  ];
  const registrations = [
    ["Import Ref (auto - do not edit)", "GSTIN", "Registered Legal Name", "Registration Type", "Status"],
    ...records.flatMap((contact, index) => contact.tax_registrations.map((registration) => [
      importReferences[index], registration.gstin, registration.legal_name, registration.registration_type, registration.status,
    ])),
  ];
  const addresses = [
    ["Import Ref (auto - do not edit)", "GSTIN", "Label", "Use", "Address Line 1", "Address Line 2", "City", "State", "State Code", "PIN Code", "Country Code", "Default Billing", "Default Shipping"],
    ...records.flatMap((contact, index) => contact.addresses.map((address) => [
      importReferences[index],
      address.tax_registration?.gstin ?? "",
      address.label ?? "",
      address.usage,
      address.address_line_1,
      address.address_line_2 ?? "",
      address.city,
      address.state_name,
      address.state_code ?? "",
      address.postal_code,
      address.country_code,
      address.is_default_billing ? "TRUE" : "FALSE",
      address.is_default_shipping ? "TRUE" : "FALSE",
    ])),
  ];
  const banks = [
    ["Import Ref (auto - do not edit)", "Account Holder Name", "Account Number", "IFSC Code", "Bank Name", "Branch", "Default"],
    ...records.flatMap((contact, index) => contact.bank_accounts.map((account) => [
      importReferences[index],
      account.account_holder_name,
      "",
      account.ifsc_code,
      account.bank_name,
      account.branch ?? "",
      account.is_default ? "TRUE" : "FALSE",
    ])),
  ];
  const instructions = [
    ["Unified Contact Master workbook"],
    ["For a new contact, enter Legal Name and Roles on the Contacts sheet. Fill other details only when available."],
    ["Import Ref is generated for you. Do not change it; choose the same reference from the dropdown on related sheets."],
    ["The system generates the Contact Code and sets new contacts to Active after a successful upload. Do not enter system status or codes."],
    ["Uploads create new contacts only. Use the contact screen to edit existing contacts; populated exports are for reference."],
    ["Roles may contain multiple values separated by semicolons. Use the dropdown to choose valid role codes."],
    ["GST registrations, addresses, and bank accounts are optional. Leave unused sheets blank."],
    ["Registration Type, Status, address use, state/country, and default flags have dropdowns where values are available."],
    ["For a new bank account, enter the complete account number. Account numbers are never included in exports."],
    ["Up to 200 contacts may be added per workbook. Each contact is saved independently."],
  ];
  setRows(contactsSheet, contacts, contacts[0].length);
  setRows(registrationsSheet, registrations, registrations[0].length);
  setRows(addressesSheet, addresses, addresses[0].length);
  setRows(banksSheet, banks, banks[0].length);
  setRows(instructionsSheet, instructions, 1);

  const contactsLastRow = Math.max(CONTACT_TEMPLATE_ROWS + 1, contacts.length);
  const registrationsLastRow = Math.max(CONTACT_TEMPLATE_ROWS + 1, registrations.length);
  const addressesLastRow = Math.max(CONTACT_TEMPLATE_ROWS + 1, addresses.length);
  const banksLastRow = Math.max(CONTACT_TEMPLATE_ROWS + 1, banks.length);
  const roleValues = uniqueValues([
    ...configuredRoles,
    "CUSTOMER", "VENDOR", "AGENT", "DISTRIBUTOR", "DEALER",
    ...records.flatMap((contact) => contact.roles.map((role) => role.role_code)),
  ]);
  const registrationTypeValues = uniqueValues([
    ...CONTACT_GST_REGISTRATION_TYPES,
    ...records.flatMap((contact) => contact.tax_registrations.map((registration) => registration.registration_type)),
  ]);
  const registrationStatusValues = uniqueValues([
    ...CONTACT_GST_REGISTRATION_STATUSES,
    ...records.flatMap((contact) => contact.tax_registrations.map((registration) => registration.status)),
  ]);
  const addressUsageValues = uniqueValues([
    "BILLING", "SHIPPING", "BOTH",
    ...records.flatMap((contact) => contact.addresses.map((address) => address.usage)),
  ]);
  const existingGstins = records.flatMap((contact) => contact.tax_registrations.map((registration) => registration.gstin));
  const stateNames = records.flatMap((contact) => contact.addresses.map((address) => address.state_name));
  const countryCodes = uniqueValues(["IN", ...records.flatMap((contact) => contact.addresses.map((address) => address.country_code))]);
  const dropdowns = [
    ["ImportReferences", importReferences],
    ["ContactRoles", roleValues],
    ["BooleanValues", ["TRUE", "FALSE"]],
    ["RegistrationTypes", registrationTypeValues],
    ["RegistrationStatuses", registrationStatusValues],
    ["AddressUsages", addressUsageValues],
    ["GstStateCodes", [...CONTACT_GST_STATE_CODES]],
    ["StateNames", stateNames],
    ["CountryCodes", countryCodes],
    ["WorkbookGstins", existingGstins],
  ] as const;
  const availableDropdowns = new Map<string, boolean>();
  dropdowns.forEach(([name, values], index) => {
    availableDropdowns.set(name, addContactList(workbook, optionsSheet, index + 1, name, values));
  });
  optionsSheet.hidden(true);
  optionsSheet.freezePanes(1, 0);

  const addAvailableDropdown = (sheet: Sheet, column: string, lastRow: number, name: string) => {
    if (availableDropdowns.get(name)) addContactDropdown(sheet, column, lastRow, name);
  };
  addAvailableDropdown(contactsSheet, "F", contactsLastRow, "ContactRoles");
  addAvailableDropdown(registrationsSheet, "D", registrationsLastRow, "RegistrationTypes");
  addAvailableDropdown(registrationsSheet, "E", registrationsLastRow, "RegistrationStatuses");
  addAvailableDropdown(registrationsSheet, "A", registrationsLastRow, "ImportReferences");
  addAvailableDropdown(addressesSheet, "A", addressesLastRow, "ImportReferences");
  addAvailableDropdown(addressesSheet, "D", addressesLastRow, "AddressUsages");
  addAvailableDropdown(addressesSheet, "H", addressesLastRow, "StateNames");
  addAvailableDropdown(addressesSheet, "I", addressesLastRow, "GstStateCodes");
  addAvailableDropdown(addressesSheet, "K", addressesLastRow, "CountryCodes");
  addAvailableDropdown(addressesSheet, "L", addressesLastRow, "BooleanValues");
  addAvailableDropdown(addressesSheet, "M", addressesLastRow, "BooleanValues");
  addAvailableDropdown(banksSheet, "A", banksLastRow, "ImportReferences");
  addAvailableDropdown(banksSheet, "G", banksLastRow, "BooleanValues");
  addAvailableDropdown(addressesSheet, "B", addressesLastRow, "WorkbookGstins");

  return workbook.outputAsync({ type: "arraybuffer" });
}
