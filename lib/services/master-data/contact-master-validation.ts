import { normalizeUppercase } from "@/lib/utilities/text-case";

export const CONTACT_GST_STATE_CODES = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
  "31", "32", "33", "34", "35", "36", "37", "38", "97", "99",
] as const;
const GST_STATE_CODES = new Set<string>(CONTACT_GST_STATE_CODES);
const GSTIN_PATTERN = /^([0-9]{2})([A-Z]{5}[0-9]{4}[A-Z])([0-9A-Z])Z([0-9A-Z])$/;
const GST_BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const CONTACT_GST_REGISTRATION_TYPES = [
  "REGULAR", "COMPOSITION", "SEZ_DEVELOPER", "SEZ_UNIT",
  "INPUT_SERVICE_DISTRIBUTOR", "TAX_DEDUCTOR", "TAX_COLLECTOR",
  "NON_RESIDENT", "OIDAR", "OTHER",
] as const;
export const CONTACT_GST_REGISTRATION_STATUSES = ["ACTIVE", "SUSPENDED", "CANCELLED"] as const;

export type ContactAddressInput = {
  id?: string;
  taxRegistrationGstin?: string | null;
  label?: string | null;
  usage: "BILLING" | "SHIPPING" | "BOTH";
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateName: string;
  stateCode?: string | null;
  postalCode: string;
  countryCode: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
};

export type ContactTaxRegistrationInput = {
  gstin: string;
  legalName: string;
  registrationType: string;
  status: string;
};

export type ContactBankAccountInput = {
  id?: string;
  accountHolderName: string;
  accountNumber?: string;
  ifscCode: string;
  bankName: string;
  branch?: string | null;
  isDefault: boolean;
};

export type ContactInput = {
  code?: string;
  legalName: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  roles: string[];
  taxRegistrations: ContactTaxRegistrationInput[];
  addresses: ContactAddressInput[];
  bankAccounts: ContactBankAccountInput[];
};

export class ContactValidationError extends Error {}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContactValidationError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, field: string, maxLength: number, required = false) {
  if (typeof value !== "string") {
    if (required) throw new ContactValidationError(`${field} is required.`);
    return null;
  }
  const clean = normalizeUppercase(value.trim());
  if (required && !clean) throw new ContactValidationError(`${field} is required.`);
  if (clean.length > maxLength) throw new ContactValidationError(`${field} is too long.`);
  return clean || null;
}

function cleanBoolean(value: unknown, field: string, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") throw new ContactValidationError(`${field} must be true or false.`);
  return value;
}

function cleanArray(value: unknown, field: string, partial: boolean) {
  if (value === undefined && partial) return undefined;
  if (!Array.isArray(value)) throw new ContactValidationError(`${field} must be an array.`);
  return value;
}

function checksumCharacter(gstinBody: string): string {
  let factor = 2;
  let sum = 0;
  for (let index = gstinBody.length - 1; index >= 0; index -= 1) {
    const product = GST_BASE36.indexOf(gstinBody[index]) * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return GST_BASE36[(36 - (sum % 36)) % 36];
}

export function normalizeAndValidateGstin(value: unknown) {
  const gstin = cleanText(value, "GSTIN", 15, true) ?? "";
  const match = GSTIN_PATTERN.exec(gstin);
  if (!match || !GST_STATE_CODES.has(match[1])) {
    throw new ContactValidationError("Enter a valid 15-character GSTIN with a recognized GST state code.");
  }
  if (checksumCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    throw new ContactValidationError("GSTIN checksum is invalid.");
  }
  return { gstin, stateCode: match[1] };
}

function parseRegistration(value: unknown): ContactTaxRegistrationInput {
  const row = requireRecord(value, "Tax registration");
  const { gstin } = normalizeAndValidateGstin(row.gstin);
  const registrationTypes = new Set<string>(CONTACT_GST_REGISTRATION_TYPES);
  const statuses = new Set<string>(CONTACT_GST_REGISTRATION_STATUSES);
  const registrationType = cleanText(row.registrationType ?? "REGULAR", "Registration type", 40, true) ?? "";
  const status = cleanText(row.status ?? "ACTIVE", "Registration status", 20, true) ?? "";
  if (!registrationTypes.has(registrationType) || !statuses.has(status)) {
    throw new ContactValidationError("Tax registration type or status is invalid.");
  }
  return {
    gstin,
    legalName: cleanText(row.legalName, "Registered legal name", 200, true) ?? "",
    registrationType,
    status,
  };
}

function parseAddress(value: unknown): ContactAddressInput {
  const row = requireRecord(value, "Address");
  const countryCode = cleanText(row.countryCode ?? "IN", "Country code", 2, true) ?? "";
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new ContactValidationError("Country code must be a two-letter ISO code.");
  const stateCode = cleanText(row.stateCode, "State code", 2);
  const postalCode = cleanText(row.postalCode, "Postal code", 20, true) ?? "";
  if (countryCode === "IN" && !/^[0-9]{6}$/.test(postalCode)) {
    throw new ContactValidationError("Indian PIN code must contain exactly 6 digits.");
  }
  if (stateCode && !/^[0-9]{2}$/.test(stateCode)) {
    throw new ContactValidationError("Indian GST state code must contain exactly 2 digits.");
  }
  if (countryCode === "IN" && (!stateCode || !GST_STATE_CODES.has(stateCode))) {
    throw new ContactValidationError("Select a valid Indian GST state code for this address.");
  }
  const usage = cleanText(row.usage, "Address use", 20, true);
  if (usage !== "BILLING" && usage !== "SHIPPING" && usage !== "BOTH") {
    throw new ContactValidationError("Address use must be Billing, Shipping, or Both.");
  }
  const isDefaultBilling = cleanBoolean(row.isDefaultBilling, "Default billing");
  const isDefaultShipping = cleanBoolean(row.isDefaultShipping, "Default shipping");
  if (isDefaultBilling && usage === "SHIPPING") {
    throw new ContactValidationError("A shipping-only address cannot be the billing default.");
  }
  if (isDefaultShipping && usage === "BILLING") {
    throw new ContactValidationError("A billing-only address cannot be the shipping default.");
  }
  const rawId = row.id;
  if (rawId !== undefined && (typeof rawId !== "string" || rawId.length > 100)) {
    throw new ContactValidationError("Address identifier is invalid.");
  }
  return {
    ...(typeof rawId === "string" ? { id: rawId } : {}),
    taxRegistrationGstin: cleanText(row.taxRegistrationGstin, "Address GSTIN", 15),
    label: cleanText(row.label, "Address label", 80),
    usage,
    addressLine1: cleanText(row.addressLine1, "Address line 1", 200, true) ?? "",
    addressLine2: cleanText(row.addressLine2, "Address line 2", 200),
    city: cleanText(row.city, "City", 100, true) ?? "",
    stateName: cleanText(row.stateName, "State", 100, true) ?? "",
    stateCode,
    postalCode,
    countryCode,
    isDefaultBilling,
    isDefaultShipping,
  };
}

function parseBankAccount(value: unknown): ContactBankAccountInput {
  const row = requireRecord(value, "Bank account");
  const ifscCode = cleanText(row.ifscCode, "IFSC code", 11, true) ?? "";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
    throw new ContactValidationError("Enter a valid 11-character IFSC code.");
  }
  const accountNumber = cleanText(row.accountNumber, "Account number", 34);
  if (accountNumber && !/^[A-Z0-9]{6,34}$/.test(accountNumber)) {
    throw new ContactValidationError("Account number must contain 6 to 34 letters or digits.");
  }
  const rawId = row.id;
  if (rawId !== undefined && (typeof rawId !== "string" || rawId.length > 100)) {
    throw new ContactValidationError("Bank account identifier is invalid.");
  }
  return {
    ...(typeof rawId === "string" ? { id: rawId } : {}),
    accountHolderName: cleanText(row.accountHolderName, "Account holder name", 200, true) ?? "",
    ...(accountNumber ? { accountNumber } : {}),
    ifscCode,
    bankName: cleanText(row.bankName, "Bank name", 120, true) ?? "",
    branch: cleanText(row.branch, "Branch", 120),
    isDefault: cleanBoolean(row.isDefault, "Default bank account"),
  };
}

export function parseContactInput(value: unknown, partial = false): Partial<ContactInput> {
  const row = requireRecord(value, "Contact");
  const output: Partial<ContactInput> = {};
  if (partial && row.code !== undefined) {
    throw new ContactValidationError("Contact codes are assigned automatically and cannot be changed.");
  }
  if (row.legalName !== undefined) output.legalName = cleanText(row.legalName, "legalName", 200, true) ?? "";
  if (row.displayName !== undefined) output.displayName = cleanText(row.displayName, "displayName", 200);
  if (row.email !== undefined) output.email = cleanText(row.email, "email", 255);
  if (row.phone !== undefined) output.phone = cleanText(row.phone, "phone", 40);
  if (row.isActive !== undefined) output.isActive = cleanBoolean(row.isActive, "Active status");

  const roles = cleanArray(row.roles, "Roles", partial);
  if (roles) {
    if (roles.length > 20) throw new ContactValidationError("A contact cannot have more than 20 roles.");
    const parsedRoles = roles.map((role) => cleanText(role, "Role", 40, true) ?? "");
    if (parsedRoles.some((role) => !/^[A-Z][A-Z0-9_]*$/.test(role))) {
      throw new ContactValidationError("Contact roles must use uppercase letters, digits, and underscores.");
    }
    if (new Set(parsedRoles).size !== parsedRoles.length) throw new ContactValidationError("Duplicate contact roles are not allowed.");
    output.roles = parsedRoles;
  }

  const registrations = cleanArray(row.taxRegistrations, "Tax registrations", partial);
  if (registrations) {
    if (registrations.length > 50) throw new ContactValidationError("A contact cannot have more than 50 GST registrations.");
    output.taxRegistrations = registrations.map(parseRegistration);
    const gstins = output.taxRegistrations.map((registration) => registration.gstin);
    if (new Set(gstins).size !== gstins.length) throw new ContactValidationError("A GSTIN can only be added once to a contact.");
  }

  const addresses = cleanArray(row.addresses, "Addresses", partial);
  if (addresses) {
    if (addresses.length > 200) throw new ContactValidationError("A contact cannot have more than 200 addresses.");
    output.addresses = addresses.map(parseAddress);
    const defaultKeys = new Set<string>();
    for (const address of output.addresses) {
      if (address.taxRegistrationGstin) {
        address.taxRegistrationGstin = normalizeAndValidateGstin(address.taxRegistrationGstin).gstin;
      }
      if (address.countryCode === "IN" && address.taxRegistrationGstin) {
        const registration = output.taxRegistrations?.find((item) => item.gstin === address.taxRegistrationGstin);
        if (!registration && !partial) {
          throw new ContactValidationError("Each address GSTIN must be one of this contact's tax registrations.");
        }
        const stateCode = normalizeAndValidateGstin(address.taxRegistrationGstin).stateCode;
        if (address.stateCode && address.stateCode !== stateCode) {
          throw new ContactValidationError("Address state code must match the linked GSTIN state code.");
        }
        if (!address.stateCode) address.stateCode = stateCode;
      }
      const registrationKey = address.taxRegistrationGstin ?? "NO-GSTIN";
      for (const [flag, enabled] of [
        ["BILLING", address.isDefaultBilling],
        ["SHIPPING", address.isDefaultShipping],
      ] as const) {
        if (!enabled) continue;
        const key = `${registrationKey}:${flag}`;
        if (defaultKeys.has(key)) throw new ContactValidationError(`Only one default ${flag.toLowerCase()} address is allowed per GSTIN.`);
        defaultKeys.add(key);
      }
    }
  }

  const bankAccounts = cleanArray(row.bankAccounts, "Bank accounts", partial);
  if (bankAccounts) {
    if (bankAccounts.length > 50) throw new ContactValidationError("A contact cannot have more than 50 bank accounts.");
    output.bankAccounts = bankAccounts.map(parseBankAccount);
    const defaults = output.bankAccounts.filter((account) => account.isDefault);
    if (defaults.length > 1) throw new ContactValidationError("Only one default bank account is allowed.");
  }

  if (!partial) {
    if (!output.legalName) throw new ContactValidationError("Contact legal name is required.");
    if (!output.roles?.length) throw new ContactValidationError("Assign at least one role to the contact.");
    output.isActive = output.isActive ?? true;
    output.taxRegistrations = output.taxRegistrations ?? [];
    output.addresses = output.addresses ?? [];
    output.bankAccounts = output.bankAccounts ?? [];
    if (output.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email)) {
      throw new ContactValidationError("Enter a valid email address.");
    }
  }
  return output;
}
