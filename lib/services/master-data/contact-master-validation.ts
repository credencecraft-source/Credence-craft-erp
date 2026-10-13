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

export class ContactValidationError extends Error {
  constructor(message: string, readonly fieldPaths: string[] = []) {
    super(message);
  }
}

function withFieldPrefix<T>(prefix: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof ContactValidationError && error.fieldPaths.length) {
      throw new ContactValidationError(
        error.message,
        error.fieldPaths.map((path) => `${prefix}.${path}`),
      );
    }
    throw error;
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContactValidationError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, field: string, maxLength: number, required = false, path = field) {
  if (typeof value !== "string") {
    if (required) throw new ContactValidationError(`${field} is required.`, [path]);
    return null;
  }
  const clean = normalizeUppercase(value.trim());
  if (required && !clean) throw new ContactValidationError(`${field} is required.`, [path]);
  if (clean.length > maxLength) throw new ContactValidationError(`${field} is too long.`, [path]);
  return clean || null;
}

function cleanBoolean(value: unknown, field: string, defaultValue = false, path = field) {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") throw new ContactValidationError(`${field} must be true or false.`, [path]);
  return value;
}

function cleanArray(value: unknown, field: string, partial: boolean, path = field) {
  if (value === undefined && partial) return undefined;
  if (!Array.isArray(value)) throw new ContactValidationError(`${field} must be an array.`, [path]);
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
  const gstin = cleanText(value, "GSTIN", 15, true, "gstin") ?? "";
  const match = GSTIN_PATTERN.exec(gstin);
  if (!match || !GST_STATE_CODES.has(match[1])) {
    throw new ContactValidationError("Enter a valid 15-character GSTIN with a recognized GST state code.", ["gstin"]);
  }
  if (checksumCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    throw new ContactValidationError("GSTIN checksum is invalid.", ["gstin"]);
  }
  return { gstin, stateCode: match[1] };
}

function parseRegistration(value: unknown): ContactTaxRegistrationInput | null {
  const row = requireRecord(value, "Tax registration");
  if (typeof row.gstin !== "string" || !row.gstin.trim()) return null;
  const { gstin } = normalizeAndValidateGstin(row.gstin);
  const registrationTypes = new Set<string>(CONTACT_GST_REGISTRATION_TYPES);
  const statuses = new Set<string>(CONTACT_GST_REGISTRATION_STATUSES);
  const registrationType = cleanText(row.registrationType ?? "REGULAR", "Registration type", 40, false, "registrationType") ?? "REGULAR";
  const status = cleanText(row.status ?? "ACTIVE", "Registration status", 20, false, "status") ?? "ACTIVE";
  if (!registrationTypes.has(registrationType) || !statuses.has(status)) {
    throw new ContactValidationError(
      "Tax registration type or status is invalid.",
      [
        ...(!registrationTypes.has(registrationType) ? ["registrationType"] : []),
        ...(!statuses.has(status) ? ["status"] : []),
      ],
    );
  }
  return {
    gstin,
    legalName: cleanText(row.legalName, "Registered legal name", 200, false, "legalName") ?? "",
    registrationType,
    status,
  };
}

function parseAddress(value: unknown): ContactAddressInput {
  const row = requireRecord(value, "Address");
  const countryCode = cleanText(row.countryCode ?? "IN", "Country code", 2, false, "countryCode") ?? "IN";
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new ContactValidationError("Country code must be a two-letter ISO code.", ["countryCode"]);
  const stateCode = cleanText(row.stateCode, "State code", 2, false, "stateCode");
  const postalCode = cleanText(row.postalCode, "Postal code", 20, false, "postalCode") ?? "";
  if (countryCode === "IN" && postalCode && !/^[0-9]{6}$/.test(postalCode)) {
    throw new ContactValidationError("Indian PIN code must contain exactly 6 digits.", ["postalCode"]);
  }
  if (stateCode && !/^[0-9]{2}$/.test(stateCode)) {
    throw new ContactValidationError("Indian GST state code must contain exactly 2 digits.", ["stateCode"]);
  }
  if (countryCode === "IN" && stateCode && !GST_STATE_CODES.has(stateCode)) {
    throw new ContactValidationError("Select a valid Indian GST state code for this address.", ["stateCode"]);
  }
  const usage = cleanText(row.usage ?? "BOTH", "Address use", 20, false, "usage") ?? "BOTH";
  if (usage !== "BILLING" && usage !== "SHIPPING" && usage !== "BOTH") {
    throw new ContactValidationError("Address use must be Billing, Shipping, or Both.", ["usage"]);
  }
  const isDefaultBilling = cleanBoolean(row.isDefaultBilling, "Default billing", false, "isDefaultBilling");
  const isDefaultShipping = cleanBoolean(row.isDefaultShipping, "Default shipping", false, "isDefaultShipping");
  if (isDefaultBilling && usage === "SHIPPING") {
    throw new ContactValidationError("A shipping-only address cannot be the billing default.", ["usage", "isDefaultBilling"]);
  }
  if (isDefaultShipping && usage === "BILLING") {
    throw new ContactValidationError("A billing-only address cannot be the shipping default.", ["usage", "isDefaultShipping"]);
  }
  const rawId = row.id;
  if (rawId !== undefined && (typeof rawId !== "string" || rawId.length > 100)) {
    throw new ContactValidationError("Address identifier is invalid.");
  }
  return {
    ...(typeof rawId === "string" ? { id: rawId } : {}),
    taxRegistrationGstin: cleanText(row.taxRegistrationGstin, "Address GSTIN", 15, false, "taxRegistrationGstin"),
    label: cleanText(row.label, "Address label", 80, false, "label"),
    usage,
    addressLine1: cleanText(row.addressLine1, "Address line 1", 200, false, "addressLine1") ?? "",
    addressLine2: cleanText(row.addressLine2, "Address line 2", 200, false, "addressLine2"),
    city: cleanText(row.city, "City", 100, false, "city") ?? "",
    stateName: cleanText(row.stateName, "State", 100, false, "stateName") ?? "",
    stateCode,
    postalCode,
    countryCode,
    isDefaultBilling,
    isDefaultShipping,
  };
}

function parseBankAccount(value: unknown): ContactBankAccountInput {
  const row = requireRecord(value, "Bank account");
  const ifscCode = cleanText(row.ifscCode, "IFSC code", 11, false, "ifscCode") ?? "";
  if (ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
    throw new ContactValidationError("Enter a valid 11-character IFSC code.", ["ifscCode"]);
  }
  const accountNumber = cleanText(row.accountNumber, "Account number", 34, false, "accountNumber");
  if (accountNumber && !/^[A-Z0-9]{6,34}$/.test(accountNumber)) {
    throw new ContactValidationError("Account number must contain 6 to 34 letters or digits.", ["accountNumber"]);
  }
  const rawId = row.id;
  if (rawId !== undefined && (typeof rawId !== "string" || rawId.length > 100)) {
    throw new ContactValidationError("Bank account identifier is invalid.");
  }
  return {
    ...(typeof rawId === "string" ? { id: rawId } : {}),
    accountHolderName: cleanText(row.accountHolderName, "Account holder name", 200, false, "accountHolderName") ?? "",
    ...(accountNumber ? { accountNumber } : {}),
    ifscCode,
    bankName: cleanText(row.bankName, "Bank name", 120, false, "bankName") ?? "",
    branch: cleanText(row.branch, "Branch", 120, false, "branch"),
    isDefault: cleanBoolean(row.isDefault, "Default bank account", false, "isDefault"),
  };
}

export function parseContactInput(value: unknown, partial = false): Partial<ContactInput> {
  const row = requireRecord(value, "Contact");
  const output: Partial<ContactInput> = {};
  if (partial && row.code !== undefined) {
    throw new ContactValidationError("Contact codes are assigned automatically and cannot be changed.");
  }
  if (row.legalName !== undefined) output.legalName = cleanText(row.legalName, "legalName", 200, false, "legalName") ?? "";
  if (row.displayName !== undefined) output.displayName = cleanText(row.displayName, "displayName", 200, false, "displayName");
  if (row.email !== undefined) output.email = cleanText(row.email, "email", 255, false, "email");
  if (row.phone !== undefined) output.phone = cleanText(row.phone, "phone", 40, false, "phone");
  if (row.isActive !== undefined) output.isActive = cleanBoolean(row.isActive, "Active status", false, "isActive");

  const roles = cleanArray(row.roles, "Roles", partial, "roles");
  if (roles) {
    if (roles.length > 20) throw new ContactValidationError("A contact cannot have more than 20 roles.", ["roles"]);
    const parsedRoles = roles.map((role) => cleanText(role, "Role", 40, true, "roles") ?? "");
    if (parsedRoles.some((role) => !/^[A-Z][A-Z0-9_]*$/.test(role))) {
      throw new ContactValidationError("Contact roles must use uppercase letters, digits, and underscores.", ["roles"]);
    }
    if (new Set(parsedRoles).size !== parsedRoles.length) throw new ContactValidationError("Duplicate contact roles are not allowed.", ["roles"]);
    output.roles = parsedRoles;
  }

  const registrations = cleanArray(row.taxRegistrations, "Tax registrations", partial, "taxRegistrations");
  if (registrations) {
    output.taxRegistrations = registrations.map((registration, index) =>
      withFieldPrefix(`taxRegistrations.${index}`, () => parseRegistration(registration)),
    )
      .filter((registration): registration is ContactTaxRegistrationInput => registration !== null);
    if (output.taxRegistrations.length > 1) {
      throw new ContactValidationError(
        "A contact can have only one GSTIN. Create a separate contact for each additional GSTIN.",
        ["taxRegistrations"],
      );
    }
  }

  const addresses = cleanArray(row.addresses, "Addresses", partial, "addresses");
  if (addresses) {
    if (addresses.length > 200) throw new ContactValidationError("A contact cannot have more than 200 addresses.", ["addresses"]);
    output.addresses = addresses.map((address, index) =>
      withFieldPrefix(`addresses.${index}`, () => parseAddress(address)),
    );
    const defaultKeys = new Set<string>();
    for (const [addressIndex, address] of output.addresses.entries()) {
      if (address.taxRegistrationGstin) {
        address.taxRegistrationGstin = withFieldPrefix(`addresses.${addressIndex}.taxRegistrationGstin`, () =>
          normalizeAndValidateGstin(address.taxRegistrationGstin),
        ).gstin;
      }
      if (address.countryCode === "IN" && address.taxRegistrationGstin) {
        const registration = output.taxRegistrations?.find((item) => item.gstin === address.taxRegistrationGstin);
        if (!registration && !partial) {
          throw new ContactValidationError(
            "Each address GSTIN must be one of this contact's tax registrations.",
            [`addresses.${addressIndex}.taxRegistrationGstin`, "taxRegistrations"],
          );
        }
        const stateCode = withFieldPrefix(`addresses.${addressIndex}.taxRegistrationGstin`, () =>
          normalizeAndValidateGstin(address.taxRegistrationGstin),
        ).stateCode;
        if (address.stateCode && address.stateCode !== stateCode) {
          const registrationIndex = output.taxRegistrations?.findIndex((item) =>
            item.gstin === address.taxRegistrationGstin,
          ) ?? -1;
          throw new ContactValidationError("Address state code must match the linked GSTIN state code.", [
            `addresses.${addressIndex}.stateCode`,
            `addresses.${addressIndex}.taxRegistrationGstin`,
            ...(registrationIndex >= 0 ? [`taxRegistrations.${registrationIndex}.gstin`] : []),
          ]);
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
        if (defaultKeys.has(key)) throw new ContactValidationError(
          `Only one default ${flag.toLowerCase()} address is allowed per GSTIN.`,
          [`addresses.${addressIndex}.${flag === "BILLING" ? "isDefaultBilling" : "isDefaultShipping"}`],
        );
        defaultKeys.add(key);
      }
    }
  }

  const bankAccounts = cleanArray(row.bankAccounts, "Bank accounts", partial, "bankAccounts");
  if (bankAccounts) {
    if (bankAccounts.length > 50) throw new ContactValidationError("A contact cannot have more than 50 bank accounts.", ["bankAccounts"]);
    output.bankAccounts = bankAccounts.map((account, index) =>
      withFieldPrefix(`bankAccounts.${index}`, () => parseBankAccount(account)),
    );
    const defaults = output.bankAccounts.filter((account) => account.isDefault);
    if (defaults.length > 1) throw new ContactValidationError("Only one default bank account is allowed.", ["bankAccounts"]);
  }

  if (!partial) {
    output.legalName = cleanText(row.legalName, "legalName", 200, false, "legalName") ?? "";
    output.isActive = output.isActive ?? true;
    output.taxRegistrations = output.taxRegistrations ?? [];
    output.addresses = output.addresses ?? [];
    output.bankAccounts = output.bankAccounts ?? [];
    if (output.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email)) {
      throw new ContactValidationError("Enter a valid email address.", ["email"]);
    }
  }
  return output;
}
