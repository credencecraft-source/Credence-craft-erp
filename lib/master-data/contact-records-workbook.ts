import * as XLSX from "xlsx";
import XlsxPopulate, { type Sheet, type Workbook } from "xlsx-populate";

import {
  CONTACT_GST_REGISTRATION_STATUSES,
  CONTACT_GST_REGISTRATION_TYPES,
  CONTACT_GST_STATE_CODES,
  parseContactInput,
  type ContactAddressInput,
  type ContactInput,
} from "@/lib/services/master-data/contact-master-validation";

const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
const MAX_CONTACT_ROWS = 200;
const MAX_RELATED_ROWS = 2000;
const CONTACT_TEMPLATE_ROWS = 500;

export type ContactWorkbookRecord = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  roles: Array<{ role_code: string }>;
  tax_registrations: Array<{
    gstin: string;
    legal_name: string;
    registration_type: string;
    status: string;
  }>;
  addresses: Array<{
    id: string;
    tax_registration?: { gstin: string } | null;
    label: string | null;
    usage: "BILLING" | "SHIPPING" | "BOTH";
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    state_name: string;
    state_code: string | null;
    postal_code: string;
    country_code: string;
    is_default_billing: boolean;
    is_default_shipping: boolean;
  }>;
  bank_accounts: Array<{
    id: string;
    account_holder_name: string;
    account_number_masked: string;
    ifsc_code: string;
    bank_name: string;
    branch: string | null;
    is_default: boolean;
  }>;
};

export type ContactWorkbookImportResult = {
  contacts: Array<{ contactKey: string; input: ContactInput }>;
  failures: Array<{ contactKey: string; message: string }>;
};

type SheetRow = Record<string, unknown>;

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function readSheet(workbook: XLSX.WorkBook, names: string[]) {
  const normalizedNames = new Set(names.map(normalizeHeader));
  const sheetName = workbook.SheetNames.find((name) => normalizedNames.has(normalizeHeader(name)));
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return [] as SheetRow[];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headers = rows[0]?.map(normalizeHeader) ?? [];
  if (headers.length > 50) throw new Error(`The "${sheetName}" sheet has too many columns.`);
  const seen = new Set<string>();
  for (const header of headers) {
    if (!header) continue;
    if (seen.has(header)) throw new Error(`The "${sheetName}" sheet contains duplicate columns.`);
    seen.add(header);
  }
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [
    header,
    values[index] ?? "",
  ]).filter(([header]) => header)));
}

function field(row: SheetRow, label: string) {
  return String(row[normalizeHeader(label)] ?? "").trim();
}

function booleanField(row: SheetRow, label: string, defaultValue = false) {
  const value = field(row, label);
  if (!value) return defaultValue;
  if (/^(true|yes|1|active)$/i.test(value)) return true;
  if (/^(false|no|0|inactive)$/i.test(value)) return false;
  throw new Error(`${label} must be TRUE or FALSE.`);
}

function addressUsage(row: SheetRow): ContactAddressInput["usage"] {
  const usage = field(row, "Use").toUpperCase();
  if (usage !== "BILLING" && usage !== "SHIPPING" && usage !== "BOTH") {
    throw new Error("Use must be BILLING, SHIPPING, or BOTH.");
  }
  return usage;
}

function contactKey(row: SheetRow) {
  return field(row, "Contact Key").toLocaleUpperCase();
}

function nonBlankRows(rows: SheetRow[]) {
  return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
}

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

export async function createContactWorkbook(records: ContactWorkbookRecord[]) {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const contactsSheet = workbook.sheet(0).name("Contacts");
  const registrationsSheet = workbook.addSheet("GST Registrations");
  const addressesSheet = workbook.addSheet("Addresses");
  const banksSheet = workbook.addSheet("Bank Accounts");
  const instructionsSheet = workbook.addSheet("Instructions");
  const optionsSheet = workbook.addSheet("Options");
  const contacts = [
    ["Contact Key", "Contact Code", "Legal Name", "Display Name", "Email", "Phone", "Roles", "Active"],
    ...records.map((contact) => [
      contact.code,
      contact.code,
      contact.legal_name,
      contact.display_name ?? "",
      contact.email ?? "",
      contact.phone ?? "",
      contact.roles.map((role) => role.role_code).join("; "),
      contact.is_active ? "TRUE" : "FALSE",
    ]),
  ];
  const registrations = [
    ["Contact Key", "GSTIN", "Registered Legal Name", "Registration Type", "Status"],
    ...records.flatMap((contact) => contact.tax_registrations.map((registration) => [
      contact.code,
      registration.gstin,
      registration.legal_name,
      registration.registration_type,
      registration.status,
    ])),
  ];
  const addresses = [
    ["Contact Key", "GSTIN", "Label", "Use", "Address Line 1", "Address Line 2", "City", "State", "State Code", "PIN Code", "Country Code", "Default Billing", "Default Shipping"],
    ...records.flatMap((contact) => contact.addresses.map((address) => [
      contact.code,
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
    ["Contact Key", "Account Holder Name", "Account Number", "Account Last 4", "IFSC Code", "Bank Name", "Branch", "Default"],
    ...records.flatMap((contact) => contact.bank_accounts.map((account) => [
      contact.code,
      account.account_holder_name,
      "",
      account.account_number_masked.match(/[0-9]{4}$/)?.[0] ?? "",
      account.ifsc_code,
      account.bank_name,
      account.branch ?? "",
      account.is_default ? "TRUE" : "FALSE",
    ])),
  ];
  const instructions = [
    ["Unified Contact Master workbook"],
    ["Contact Key joins contacts to GST Registrations, Addresses, and Bank Accounts sheets."],
    ["For new contacts, use a unique NEW-... Contact Key. Existing exported CT codes are reference-only and cannot be imported."],
    ["Contact Code is generated by the system and is ignored during import."],
    ["Imports create contacts; they do not update existing contacts. Each contact is saved independently."],
    ["Choose system values from the dropdowns. Where free entry is allowed, dropdowns show values already in this organization."],
    ["Enter roles as configured role codes separated by semicolons (for example CUSTOMER; VENDOR)."],
    ["GSTINs are validated, and address state codes must match their linked GSTIN."],
    ["Bank account numbers are confidential: exports intentionally leave the full account number blank. Enter the complete account number only when importing a new bank account."],
    ["Use Download blank template in the upload dialog for a clean import workbook."],
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
    ["ContactRoles", roleValues],
    ["BooleanValues", ["TRUE", "FALSE"]],
    ["RegistrationTypes", registrationTypeValues],
    ["RegistrationStatuses", registrationStatusValues],
    ["AddressUsages", addressUsageValues],
    ["GstStateCodes", [...CONTACT_GST_STATE_CODES]],
    ["StateNames", stateNames],
    ["CountryCodes", countryCodes],
    ["ExistingGstins", existingGstins],
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
  addAvailableDropdown(contactsSheet, "G", contactsLastRow, "ContactRoles");
  addAvailableDropdown(contactsSheet, "H", contactsLastRow, "BooleanValues");
  addAvailableDropdown(registrationsSheet, "D", registrationsLastRow, "RegistrationTypes");
  addAvailableDropdown(registrationsSheet, "E", registrationsLastRow, "RegistrationStatuses");
  addAvailableDropdown(addressesSheet, "B", addressesLastRow, "ExistingGstins");
  addAvailableDropdown(addressesSheet, "D", addressesLastRow, "AddressUsages");
  addAvailableDropdown(addressesSheet, "H", addressesLastRow, "StateNames");
  addAvailableDropdown(addressesSheet, "I", addressesLastRow, "GstStateCodes");
  addAvailableDropdown(addressesSheet, "J", addressesLastRow, "CountryCodes");
  addAvailableDropdown(addressesSheet, "L", addressesLastRow, "BooleanValues");
  addAvailableDropdown(addressesSheet, "M", addressesLastRow, "BooleanValues");
  addAvailableDropdown(banksSheet, "H", banksLastRow, "BooleanValues");

  return workbook.outputAsync({ type: "arraybuffer" });
}

export async function parseContactWorkbook(file: File): Promise<ContactWorkbookImportResult> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx contact workbook.");
  if (file.size === 0 || file.size > MAX_WORKBOOK_BYTES) throw new Error("Contact workbooks must be between 1 byte and 10 MB.");

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, cellFormula: false });
  } catch {
    throw new Error("The Excel workbook could not be read. Download a fresh template and try again.");
  }

  const contactRows = nonBlankRows(readSheet(workbook, ["Contacts"]));
  const registrationRows = nonBlankRows(readSheet(workbook, ["GST Registrations"]));
  const addressRows = nonBlankRows(readSheet(workbook, ["Addresses"]));
  const bankRows = nonBlankRows(readSheet(workbook, ["Bank Accounts"]));
  if (!contactRows.length) throw new Error("The Contacts sheet contains no data rows.");
  if (contactRows.length > MAX_CONTACT_ROWS) throw new Error(`A workbook may contain at most ${MAX_CONTACT_ROWS} contacts.`);
  if (registrationRows.length + addressRows.length + bankRows.length > MAX_RELATED_ROWS) {
    throw new Error(`A workbook may contain at most ${MAX_RELATED_ROWS} related rows.`);
  }

  const failures: ContactWorkbookImportResult["failures"] = [];
  const contactsByKey = new Map<string, ContactInput>();
  for (const [index, row] of contactRows.entries()) {
    const key = contactKey(row);
    if (!key) {
      failures.push({ contactKey: `Contacts row ${index + 2}`, message: "Contact Key is required." });
      continue;
    }
    if (!/^NEW-[A-Z0-9_-]{1,56}$/.test(key)) {
      failures.push({ contactKey: key, message: "New contacts require a NEW- prefixed Contact Key. Exported CT codes are for reference only." });
      continue;
    }
    if (contactsByKey.has(key)) {
      failures.push({ contactKey: key, message: "Contact Key must be unique within the workbook." });
      continue;
    }
    const roles = field(row, "Roles").split(/[;,]/).map((role) => role.trim()).filter(Boolean);
    try {
      const parsed = parseContactInput({
        legalName: field(row, "Legal Name"),
        displayName: field(row, "Display Name") || null,
        email: field(row, "Email") || null,
        phone: field(row, "Phone") || null,
        isActive: booleanField(row, "Active", true),
        roles,
        taxRegistrations: [],
        addresses: [],
        bankAccounts: [],
      }) as ContactInput;
      contactsByKey.set(key, parsed);
    } catch (error) {
      failures.push({
        contactKey: key,
        message: error instanceof Error ? error.message : "Contact details are invalid.",
      });
    }
  }

  const invalidKeys = new Set(failures.map((failure) => failure.contactKey));
  const appendRelated = <T>(
    rows: SheetRow[],
    kind: string,
    create: (row: SheetRow) => T,
    append: (contact: ContactInput, value: T) => void,
  ) => {
    for (const [index, row] of rows.entries()) {
      const key = contactKey(row);
      const contact = contactsByKey.get(key);
      if (!contact || invalidKeys.has(key)) {
        failures.push({
          contactKey: key || `${kind} row ${index + 2}`,
          message: key ? "Contact Key does not identify a valid contact in the Contacts sheet." : "Contact Key is required.",
        });
        continue;
      }
      try {
        append(contact, create(row));
      } catch (error) {
        invalidKeys.add(key);
        failures.push({
          contactKey: key,
          message: error instanceof Error ? error.message : `${kind} row is invalid.`,
        });
      }
    }
  };

  appendRelated(registrationRows, "GST registration", (row) => ({
    gstin: field(row, "GSTIN"),
    legalName: field(row, "Registered Legal Name"),
    registrationType: field(row, "Registration Type") || "REGULAR",
    status: field(row, "Status") || "ACTIVE",
  }), (contact, registration) => {
    contact.taxRegistrations.push(registration);
  });

  appendRelated(addressRows, "Address", (row) => ({
    taxRegistrationGstin: field(row, "GSTIN") || null,
    label: field(row, "Label") || null,
    usage: addressUsage(row),
    addressLine1: field(row, "Address Line 1"),
    addressLine2: field(row, "Address Line 2") || null,
    city: field(row, "City"),
    stateName: field(row, "State"),
    stateCode: field(row, "State Code") || null,
    postalCode: field(row, "PIN Code"),
    countryCode: field(row, "Country Code") || "IN",
    isDefaultBilling: booleanField(row, "Default Billing"),
    isDefaultShipping: booleanField(row, "Default Shipping"),
  }), (contact, address) => {
    contact.addresses.push(address);
  });

  appendRelated(bankRows, "Bank account", (row) => {
    const accountNumber = field(row, "Account Number");
    if (!accountNumber) throw new Error("Full Account Number is required for a new bank account.");
    if (/^[•*xX]+/.test(accountNumber)) throw new Error("Enter the full Account Number; masked values cannot be imported.");
    return {
      accountHolderName: field(row, "Account Holder Name"),
      accountNumber,
      ifscCode: field(row, "IFSC Code"),
      bankName: field(row, "Bank Name"),
      branch: field(row, "Branch") || null,
      isDefault: booleanField(row, "Default"),
    };
  }, (contact, account) => {
    contact.bankAccounts.push(account);
  });

  const readyContacts: ContactWorkbookImportResult["contacts"] = [];
  for (const [key, contact] of contactsByKey) {
    if (invalidKeys.has(key)) continue;
    try {
      readyContacts.push({ contactKey: key, input: parseContactInput(contact) as ContactInput });
    } catch (error) {
      invalidKeys.add(key);
      failures.push({
        contactKey: key,
        message: error instanceof Error ? error.message : "Contact data is invalid.",
      });
    }
  }
  return {
    contacts: readyContacts,
    failures: failures.slice(0, 100),
  };
}
