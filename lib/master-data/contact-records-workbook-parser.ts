import * as XLSX from "xlsx";

import {
  ContactValidationError,
  parseContactInput,
  type ContactAddressInput,
  type ContactInput,
} from "@/lib/services/master-data/contact-master-validation";
import { normalizeUppercase } from "@/lib/utilities/text-case";

const MAX_WORKBOOK_BYTES = 50 * 1024 * 1024;
export const MAX_CONTACT_ROWS = 100_000;
const MAX_RELATED_ROWS = 300_000;

export type ContactWorkbookRecord = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  roles: Array<{ role_code: string }>;
  distributor_mappings?: Array<{ dealer: { id: string } }>;
  dealer_mappings?: Array<{ distributor: { id: string } }>;
  role_parent_mappings?: Array<{ id: string; parent_role_code: string; mapped_contact: { id: string } }>;
  role_mapped_contacts?: Array<{ id: string; parent_role_code: string; parent_contact: { id: string } }>;
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
  failures: Array<{ contactKey: string; message: string; fieldPaths?: string[] }>;
  corrections: Array<{ contactKey: string; field: string; original: string; corrected: string }>;
  invalidContacts: Array<{ contactKey: string; input: ContactInput; message: string; fieldPaths: string[] }>;
};

export function getRetryableContactImportRows(
  contacts: ContactWorkbookImportResult["contacts"],
  failures: ContactWorkbookImportResult["failures"],
) {
  const failedKeys = new Set(failures.map((failure) => failure.contactKey));
  return contacts.filter((contact) => failedKeys.has(contact.contactKey));
}

type SheetRow = Record<string, unknown>;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*\*\s*$/, "")
    .toLocaleLowerCase();
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
  throw new ContactValidationError(`${label} must be TRUE or FALSE.`);
}

function addressUsage(row: SheetRow): ContactAddressInput["usage"] {
  const usage = field(row, "Use").toUpperCase();
  if (usage !== "BILLING" && usage !== "SHIPPING" && usage !== "BOTH") {
    throw new ContactValidationError("Use must be BILLING, SHIPPING, or BOTH.", ["usage"]);
  }
  return usage;
}

function contactKey(row: SheetRow) {
  return (field(row, "Import Ref (auto - do not edit)") || field(row, "Contact Key")).toLocaleUpperCase();
}

function hasContactInput(row: SheetRow) {
  return ["Legal Name", "Display Name", "Email", "Phone", "Roles"]
    .some((label) => field(row, label) !== "");
}

function nonBlankRows(rows: SheetRow[]) {
  return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
}

function normalizeRole(role: string) {
  return normalizeUppercase(role.trim())
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitRoles(value: string) {
  return value.split(/[;,/|&+]+|\s+AND\s+/i).map((role) => role.trim()).filter(Boolean);
}

function parseSingleSheetContacts(workbook: XLSX.WorkBook): ContactWorkbookImportResult {
  const rows = nonBlankRows(readSheet(workbook, ["Contacts"]));
  if (!rows.length) throw new Error("Enter at least one contact row on the Contacts sheet.");
  if (rows.length > MAX_CONTACT_ROWS) throw new Error(`A workbook may contain at most ${MAX_CONTACT_ROWS} contacts.`);

  const contacts: ContactWorkbookImportResult["contacts"] = [];
  const failures: ContactWorkbookImportResult["failures"] = [];
  const corrections: ContactWorkbookImportResult["corrections"] = [];
  const invalidContacts: ContactWorkbookImportResult["invalidContacts"] = [];
  for (const [index, row] of rows.entries()) {
    const contactKey = `ROW-${index + 2}`;
    const importReference = field(row, "Import Ref (auto - do not edit)") || field(row, "Contact Key");
    if (importReference && !/^NEW-[A-Z0-9_-]{1,56}$/i.test(importReference)) {
      failures.push({
        contactKey,
        message: "This workbook contains an existing-contact reference. Use the blank template to upload new contacts.",
      });
      continue;
    }
    if (field(row, "Contact Code")) {
      failures.push({
        contactKey,
        message: "This row contains a system-generated Contact Code and cannot be imported. Use the blank template to add new contacts.",
      });
      continue;
    }

    const legalName = field(row, "Legal Name");
    const gstin = field(row, "GSTIN");
    const addressPresent = [
      "Address Label", "Address Use", "Address Line 1", "Address Line 2",
      "City", "State", "State Code", "PIN Code", "Country Code",
      "Default Billing", "Default Shipping",
    ].some((label) => field(row, label) !== "");
    const bankPresent = [
      "Account Holder Name", "Account Number", "IFSC Code", "Bank Name",
      "Branch", "Default Bank Account",
    ].some((label) => field(row, label) !== "");
    const usage = (field(row, "Address Use") || "BOTH").toUpperCase();
    const roleCorrections: ContactWorkbookImportResult["corrections"] = [];

    let candidateInput: ContactInput | null = null;
    try {
      const roles = splitRoles(field(row, "Roles")).map((role) => {
        const corrected = normalizeRole(role);
        if (corrected !== role) {
          roleCorrections.push({ contactKey, field: "Roles", original: role, corrected });
        }
        return corrected;
      });
      corrections.push(...roleCorrections);
      const taxRegistrations = gstin ? [{
        gstin,
        legalName: field(row, "GST Registered Legal Name") || legalName,
        registrationType: field(row, "GST Registration Type") || "REGULAR",
        status: field(row, "GST Registration Status") || "ACTIVE",
      }] : [];
      const addresses = addressPresent ? [{
        taxRegistrationGstin: gstin || null,
        label: field(row, "Address Label") || null,
        usage,
        addressLine1: field(row, "Address Line 1"),
        addressLine2: field(row, "Address Line 2") || null,
        city: field(row, "City"),
        stateName: field(row, "State"),
        stateCode: field(row, "State Code") || null,
        postalCode: field(row, "PIN Code"),
        countryCode: field(row, "Country Code") || "IN",
        isDefaultBilling: booleanField(row, "Default Billing", usage !== "SHIPPING"),
        isDefaultShipping: booleanField(row, "Default Shipping", usage !== "BILLING"),
      }] : [];
      const accountNumber = field(row, "Account Number");
      const bankAccounts = bankPresent ? [{
        accountHolderName: field(row, "Account Holder Name"),
        accountNumber,
        ifscCode: field(row, "IFSC Code"),
        bankName: field(row, "Bank Name"),
        branch: field(row, "Branch") || null,
        isDefault: booleanField(row, "Default Bank Account", true),
      }] : [];
      candidateInput = {
        legalName,
        displayName: field(row, "Display Name") || null,
        email: field(row, "Email") || null,
        phone: field(row, "Phone") || null,
        isActive: true,
        roles,
        taxRegistrations,
        addresses,
        bankAccounts,
      } as ContactInput;
      const input = parseContactInput(candidateInput) as ContactInput;
      contacts.push({ contactKey, input });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Contact details are invalid.";
      failures.push({
        contactKey,
        message,
        fieldPaths: error instanceof ContactValidationError ? error.fieldPaths : [],
      });
      if (candidateInput) invalidContacts.push({
        contactKey,
        input: candidateInput,
        message,
        fieldPaths: error instanceof ContactValidationError ? error.fieldPaths : [],
      });
    }
  }

  return { contacts, failures, corrections, invalidContacts };
}

export async function parseContactWorkbook(file: File): Promise<ContactWorkbookImportResult> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx contact workbook.");
  if (file.size === 0 || file.size > MAX_WORKBOOK_BYTES) throw new Error("Contact workbooks must be between 1 byte and 50 MB.");

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, cellFormula: false });
  } catch {
    throw new Error("The Excel workbook could not be read. Download a fresh template and try again.");
  }

  if (workbook.SheetNames.length <= 1) return parseSingleSheetContacts(workbook);

  const contactRows = readSheet(workbook, ["Contacts"])
    .map((row, index) => ({ row, rowIndex: index }))
    .filter(({ row }) => hasContactInput(row));
  const registrationRows = nonBlankRows(readSheet(workbook, ["GST Registrations"]));
  const addressRows = nonBlankRows(readSheet(workbook, ["Addresses"]));
  const bankRows = nonBlankRows(readSheet(workbook, ["Bank Accounts"]));
  if (!contactRows.length) throw new Error("Enter at least one contact row on the Contacts sheet.");
  if (contactRows.length > MAX_CONTACT_ROWS) throw new Error(`A workbook may contain at most ${MAX_CONTACT_ROWS} contacts.`);
  if (registrationRows.length + addressRows.length + bankRows.length > MAX_RELATED_ROWS) {
    throw new Error(`A workbook may contain at most ${MAX_RELATED_ROWS} related rows.`);
  }

  const failures: ContactWorkbookImportResult["failures"] = [];
  const contactsByKey = new Map<string, ContactInput>();
  const candidatesByKey = new Map<string, ContactInput>();
  for (const { row, rowIndex } of contactRows) {
    const key = contactKey(row) || `NEW-${String(rowIndex + 1).padStart(3, "0")}`;
    if (!/^NEW-[A-Z0-9_-]{1,56}$/.test(key)) {
      failures.push({ contactKey: key, message: "This workbook is an existing-contact export. Use the blank template to upload new contacts; existing contacts are updated from the contact screen." });
      continue;
    }
    if (contactsByKey.has(key)) {
      failures.push({ contactKey: key, message: "Contact Key must be unique within the workbook." });
      continue;
    }
    const roles = field(row, "Roles").split(/[;,]/).map((role) => role.trim()).filter(Boolean);
    const candidate: ContactInput = {
        legalName: field(row, "Legal Name"),
        displayName: field(row, "Display Name") || null,
        email: field(row, "Email") || null,
        phone: field(row, "Phone") || null,
        isActive: true,
        roles,
        taxRegistrations: [],
        addresses: [],
        bankAccounts: [],
      };
    try {
      const parsed = parseContactInput(candidate) as ContactInput;
      contactsByKey.set(key, parsed);
      candidatesByKey.set(key, parsed);
    } catch (error) {
      candidatesByKey.set(key, candidate);
      failures.push({
        contactKey: key,
        message: error instanceof Error ? error.message : "Contact details are invalid.",
        fieldPaths: error instanceof ContactValidationError ? error.fieldPaths : [],
      });
    }
  }

  const invalidKeys = new Set(failures.map((failure) => failure.contactKey));
  const appendRelated = <T>(
    rows: SheetRow[],
    kind: string,
    collection: "taxRegistrations" | "addresses" | "bankAccounts",
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
        const fieldPaths = error instanceof ContactValidationError
          ? error.fieldPaths.map((path) => `${collection}.${contact[collection].length}.${path}`)
          : [];
        failures.push({
          contactKey: key,
          message: error instanceof Error ? error.message : `${kind} row is invalid.`,
          fieldPaths,
        });
      }
    }
  };

  appendRelated(registrationRows, "GST registration", "taxRegistrations", (row) => ({
    gstin: field(row, "GSTIN"),
    legalName: field(row, "Registered Legal Name"),
    registrationType: field(row, "Registration Type") || "REGULAR",
    status: field(row, "Status") || "ACTIVE",
  }), (contact, registration) => {
    contact.taxRegistrations.push(registration);
  });

  appendRelated(addressRows, "Address", "addresses", (row) => ({
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

  appendRelated(bankRows, "Bank account", "bankAccounts", (row) => {
    const accountNumber = field(row, "Account Number");
    if (/^[•*xX]+/.test(accountNumber)) {
      throw new ContactValidationError("Enter the full Account Number; masked values cannot be imported.", ["accountNumber"]);
    }
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
        message: error instanceof Error ? error.message : "Contact details are invalid.",
        fieldPaths: error instanceof ContactValidationError ? error.fieldPaths : [],
      });
    }
  }
  const invalidContacts = [...invalidKeys].flatMap((key) => {
    const input = candidatesByKey.get(key);
    if (!input) return [];
    const failure = failures.find((item) => item.contactKey === key);
    return [{
      contactKey: key,
      input,
      message: failure?.message ?? "Contact details are invalid.",
      fieldPaths: failure?.fieldPaths ?? [],
    }];
  });
  return { contacts: readyContacts, failures, corrections: [], invalidContacts };
}
