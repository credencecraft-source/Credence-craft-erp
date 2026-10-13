import { CONTACT_WORKBOOK_COLUMNS } from "./contact-records-workbook-columns";

const INTERNAL_PAYLOAD_FIELDS = new Set([
  "checkpoint",
  "contactKey",
  "corrections",
  "id",
  "rowNumber",
  "validationErrors",
]);

const INITIALISMS = new Set(["gstin", "hsn", "ifsc", "pan", "pin", "sku", "tan", "uom", "url"]);

export type ImportReportField = {
  key: string;
  label: string;
  type?: string;
  multiple?: boolean;
};

export function getContactTemplateFieldValues(input: Record<string, unknown>) {
  const addresses = Array.isArray(input.addresses) ? input.addresses.filter(isRecord) : [];
  const registrations = Array.isArray(input.taxRegistrations)
    ? input.taxRegistrations.filter(isRecord)
    : [];
  const bankAccounts = Array.isArray(input.bankAccounts)
    ? input.bankAccounts.filter(isRecord)
    : [];
  const address = addresses.find((item) => item.isDefaultBilling === true)
    ?? addresses.find((item) => item.isDefaultShipping === true)
    ?? addresses[0];
  const addressGstin = typeof address?.taxRegistrationGstin === "string"
    ? address.taxRegistrationGstin
    : "";
  const registration = registrations.find((item) => item.gstin === addressGstin)
    ?? registrations.find((item) => item.status === "ACTIVE")
    ?? registrations[0];
  const bank = bankAccounts.find((item) => item.isDefault === true) ?? bankAccounts[0];
  const roles = Array.isArray(input.roles)
    ? input.roles.filter((role): role is string => typeof role === "string").join("; ")
    : "";
  const values: Record<string, unknown> = {
    "Legal Name": input.legalName,
    "Display Name": input.displayName,
    Email: input.email,
    Phone: input.phone,
    "Roles (optional; separate with semicolons)": roles,
    GSTIN: registration?.gstin,
    "GST Registered Legal Name": registration?.legalName,
    "GST Registration Type": registration?.registrationType,
    "GST Registration Status": registration?.status,
    "Address Label": address?.label,
    "Address Use": address?.usage,
    "Address Line 1": address?.addressLine1,
    "Address Line 2": address?.addressLine2,
    City: address?.city,
    State: address?.stateName,
    "State Code": address?.stateCode,
    "PIN Code": address?.postalCode,
    "Country Code": address?.countryCode,
    "Default Billing": address?.isDefaultBilling,
    "Default Shipping": address?.isDefaultShipping,
    "Account Holder Name": bank?.accountHolderName,
    "Account Number": bank?.accountNumber,
    "IFSC Code": bank?.ifscCode,
    "Bank Name": bank?.bankName,
    Branch: bank?.branch,
    "Default Bank Account": bank?.isDefault,
  };

  return Object.fromEntries(CONTACT_WORKBOOK_COLUMNS.map((header) => [
    header,
    formatImportReportValue(values[header]),
  ]));
}

export function humanizeImportFieldName(path: string) {
  return path
    .replaceAll("_", " ")
    .split(".")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return `Row ${Number(segment) + 1}`;
      return segment
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Za-z])([0-9])/g, "$1 $2")
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => INITIALISMS.has(word.toLowerCase())
          ? word.toUpperCase()
          : `${word[0].toUpperCase()}${word.slice(1)}`)
        .join(" ");
    })
    .join(" / ");
}

export function contactTemplateFieldName(path: string) {
  const key = path.split(".").at(-1) ?? path;
  const addressFields: Record<string, string> = {
    label: "Address Label",
    usage: "Address Use",
    addressLine1: "Address Line 1",
    addressLine2: "Address Line 2",
    city: "City",
    stateName: "State",
    stateCode: "State Code",
    postalCode: "PIN Code",
    countryCode: "Country Code",
    isDefaultBilling: "Default Billing",
    isDefaultShipping: "Default Shipping",
  };
  const registrationFields: Record<string, string> = {
    gstin: "GSTIN",
    legalName: "GST Registered Legal Name",
    registrationType: "GST Registration Type",
    status: "GST Registration Status",
  };
  const bankFields: Record<string, string> = {
    accountHolderName: "Account Holder Name",
    accountNumber: "Account Number",
    ifscCode: "IFSC Code",
    bankName: "Bank Name",
    branch: "Branch",
    isDefault: "Default Bank Account",
  };
  if (path.includes("taxRegistrations")) return registrationFields[key] ?? humanizeImportFieldName(key);
  if (path.includes("addresses")) return addressFields[key] ?? humanizeImportFieldName(key);
  if (path.includes("bankAccounts")) return bankFields[key] ?? humanizeImportFieldName(key);
  const rootFields: Record<string, string> = {
    legalName: "Legal Name",
    displayName: "Display Name",
    email: "Email",
    phone: "Phone",
    roles: "Roles (optional; separate with semicolons)",
  };
  return rootFields[key] ?? humanizeImportFieldName(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatImportReportValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const formatted = formatImportReportValue(item);
      return formatted ? `${index + 1}. ${formatted}` : "";
    }).filter(Boolean).join("\n");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => !INTERNAL_PAYLOAD_FIELDS.has(key))
      .map(([key, child]) => {
        const formatted = formatImportReportValue(child);
        return formatted ? `${humanizeImportFieldName(key)}: ${formatted}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function getImportReportFields(
  payload: Record<string, unknown>,
  moduleFields: ImportReportField[] = [],
) {
  const input = isRecord(payload.input) ? payload.input : null;
  const fields = isRecord(payload.fields) ? payload.fields : null;
  const childRows = isRecord(payload.childRows) ? payload.childRows : null;
  if (input) return getContactTemplateFieldValues(input);

  const result: Record<string, string> = {};
  if (fields) {
    for (const field of moduleFields) {
      result[field.label] = formatImportReportValue(
        childRows && Object.hasOwn(childRows, field.key)
          ? childRows[field.key]
          : fields[field.key],
      );
    }
    result["Master Code"] = formatImportReportValue(payload.code);
    result.Description = formatImportReportValue(payload.description);
    return result;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (!INTERNAL_PAYLOAD_FIELDS.has(key) && key !== "input") {
      result[key] = formatImportReportValue(value);
    }
  }
  return result;
}

export function isImportReportError(status: string, validationErrors: string) {
  return Boolean(validationErrors.trim()) || status === "INVALID" || status === "FAILED";
}
