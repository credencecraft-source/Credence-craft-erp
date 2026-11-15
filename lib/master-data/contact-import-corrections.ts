import type {
  MasterImportCorrectionField,
  MasterImportCorrectionRow,
} from "@/components/master-data/master-import-correction";
import {
  parseContactInput,
  type ContactAddressInput,
  type ContactInput,
} from "@/lib/services/master-data/contact-master-validation";

const CONTACT_FIELD_KEYS: Record<string, string> = {
  legalName: "legalName",
  displayName: "displayName",
  email: "email",
  phone: "phone",
  roles: "roles",
  gstin: "gstin",
  registrationType: "registrationType",
  status: "registrationStatus",
  taxRegistrationGstin: "addressGstin",
  label: "addressLabel",
  usage: "addressUse",
  addressLine1: "addressLine1",
  addressLine2: "addressLine2",
  city: "addressCity",
  stateName: "addressState",
  stateCode: "addressStateCode",
  postalCode: "addressPinCode",
  countryCode: "addressCountryCode",
  isDefaultBilling: "addressDefaultBilling",
  isDefaultShipping: "addressDefaultShipping",
  accountHolderName: "bankAccountHolder",
  accountNumber: "accountNumber",
  ifscCode: "bankIfsc",
  bankName: "bankName",
  branch: "bankBranch",
  isDefault: "bankDefault",
};

export function getContactCorrectionErrorFields(fieldPaths: string[], input: ContactInput) {
  const keys = new Set<string>();
  for (const path of fieldPaths) {
    const [collection, indexText, fieldKey] = path.split(".");
    if (collection === "taxRegistrations" && indexText === undefined) {
      input.taxRegistrations.forEach((_, index) => keys.add(`gstin_${index}`));
      continue;
    }
    if (collection === "addresses" && indexText === undefined) {
      input.addresses.forEach((_, index) => keys.add(`addressLine1_${index}`));
      continue;
    }
    if (collection === "bankAccounts" && indexText === undefined) {
      input.bankAccounts.forEach((_, index) => keys.add(`bankDefault_${index}`));
      continue;
    }
    const index = Number(indexText);
    const correctionField = fieldKey ? CONTACT_FIELD_KEYS[fieldKey] : CONTACT_FIELD_KEYS[collection];
    if (correctionField && Number.isInteger(index) && index >= 0) {
      keys.add(`${correctionField}_${index}`);
    } else if (correctionField) {
      keys.add(correctionField);
    }
  }

  return [...keys];
}

export function createContactCorrectionRow(
  contactKey: string,
  input: ContactInput,
  message: string,
  fieldPaths: string[] = [],
): MasterImportCorrectionRow {
  const fields: MasterImportCorrectionField[] = [
    { key: "legalName", label: "Legal Name" },
    { key: "displayName", label: "Display Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "roles", label: "Roles" },
  ];
  const values: Record<string, string> = {
    legalName: input.legalName,
    displayName: input.displayName ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    roles: input.roles.join("; "),
  };

  input.taxRegistrations.forEach((registration, index) => {
    const suffix = index + 1;
    const keys = [
      [`gstin_${index}`, `GSTIN ${suffix}`, registration.gstin],
      [`registrationLegalName_${index}`, `GST Registered Legal Name ${suffix}`, registration.legalName],
      [`registrationType_${index}`, `Registration Type ${suffix}`, registration.registrationType],
      [`registrationStatus_${index}`, `Registration Status ${suffix}`, registration.status],
    ] as const;
    for (const [key, label, value] of keys) {
      fields.push({ key, label });
      values[key] = value;
    }
  });

  input.addresses.forEach((address, index) => {
    const suffix = index + 1;
    const keys = [
      [`addressGstin_${index}`, `Address GSTIN ${suffix}`, address.taxRegistrationGstin ?? ""],
      [`addressLabel_${index}`, `Address Label ${suffix}`, address.label ?? ""],
      [`addressUse_${index}`, `Address Use ${suffix}`, address.usage],
      [`addressLine1_${index}`, `Address Line 1 ${suffix}`, address.addressLine1],
      [`addressLine2_${index}`, `Address Line 2 ${suffix}`, address.addressLine2 ?? ""],
      [`addressCity_${index}`, `City ${suffix}`, address.city],
      [`addressState_${index}`, `State ${suffix}`, address.stateName],
      [`addressStateCode_${index}`, `State Code ${suffix}`, address.stateCode ?? ""],
      [`addressPinCode_${index}`, `PIN Code ${suffix}`, address.postalCode],
      [`addressCountryCode_${index}`, `Country Code ${suffix}`, address.countryCode],
      [`addressDefaultBilling_${index}`, `Default Billing ${suffix}`, String(address.isDefaultBilling)],
      [`addressDefaultShipping_${index}`, `Default Shipping ${suffix}`, String(address.isDefaultShipping)],
    ] as const;
    for (const [key, label, value] of keys) {
      fields.push({ key, label });
      values[key] = value;
    }
  });

  input.bankAccounts.forEach((account, index) => {
    const suffix = index + 1;
    const keys = [
      [`bankAccountHolder_${index}`, `Bank Account Holder ${suffix}`, account.accountHolderName],
      [`bankIfsc_${index}`, `IFSC Code ${suffix}`, account.ifscCode],
      [`bankName_${index}`, `Bank Name ${suffix}`, account.bankName],
      [`bankBranch_${index}`, `Bank Branch ${suffix}`, account.branch ?? ""],
      [`bankDefault_${index}`, `Default Bank Account ${suffix}`, String(account.isDefault)],
    ] as const;
    for (const [key, label, value] of keys) {
      fields.push({ key, label });
      values[key] = value;
    }
    const accountNumberKey = `accountNumber_${index}`;
    fields.push({
      key: accountNumberKey,
      label: `Bank Account Number ${suffix}`,
      sensitive: true,
      placeholder: "Blank keeps current number",
    });
    values[accountNumberKey] = "";
  });

  const rowNumber = /^ROW-(\d+)$/i.exec(contactKey)?.[1];
  const displayName = input.displayName || input.legalName || "Contact";
  const errorFields = getContactCorrectionErrorFields(fieldPaths, input);
  return {
    id: contactKey,
    identity: rowNumber ? `${displayName} - spreadsheet row ${rowNumber}` : displayName,
    values,
    errors: Object.fromEntries(
      (errorFields.length ? errorFields : ["_row"]).map((key) => [key, [message]]),
    ),
    fields,
  };
}

export function createContactCorrectionDraft(
  input: ContactInput,
  values: Record<string, string>,
): ContactInput {
  const taxRegistrations = input.taxRegistrations.map((registration, index) => ({
    ...registration,
    gstin: values[`gstin_${index}`] ?? registration.gstin,
    legalName: values[`registrationLegalName_${index}`] ?? registration.legalName,
    registrationType: values[`registrationType_${index}`] ?? registration.registrationType,
    status: values[`registrationStatus_${index}`] ?? registration.status,
  }));
  const addresses = input.addresses.map((address, index) => ({
    ...address,
    taxRegistrationGstin: values[`addressGstin_${index}`] ?? address.taxRegistrationGstin ?? null,
    label: values[`addressLabel_${index}`] ?? address.label ?? null,
    usage: (values[`addressUse_${index}`] ?? address.usage) as ContactAddressInput["usage"],
    addressLine1: values[`addressLine1_${index}`] ?? address.addressLine1,
    addressLine2: values[`addressLine2_${index}`] ?? address.addressLine2 ?? null,
    city: values[`addressCity_${index}`] ?? address.city,
    stateName: values[`addressState_${index}`] ?? address.stateName,
    stateCode: values[`addressStateCode_${index}`] ?? address.stateCode ?? null,
    postalCode: values[`addressPinCode_${index}`] ?? address.postalCode,
    countryCode: values[`addressCountryCode_${index}`] ?? address.countryCode,
    isDefaultBilling: /^(true|yes|1)$/i.test(values[`addressDefaultBilling_${index}`] ?? String(address.isDefaultBilling)),
    isDefaultShipping: /^(true|yes|1)$/i.test(values[`addressDefaultShipping_${index}`] ?? String(address.isDefaultShipping)),
  }));
  const bankAccounts = input.bankAccounts.map((account, index) => ({
    ...account,
    accountHolderName: values[`bankAccountHolder_${index}`] ?? account.accountHolderName,
    accountNumber: values[`accountNumber_${index}`] || account.accountNumber || "",
    ifscCode: values[`bankIfsc_${index}`] ?? account.ifscCode,
    bankName: values[`bankName_${index}`] ?? account.bankName,
    branch: values[`bankBranch_${index}`] ?? account.branch ?? null,
    isDefault: /^(true|yes|1)$/i.test(values[`bankDefault_${index}`] ?? String(account.isDefault)),
  }));
  const roles = (values.roles ?? input.roles.join("; "))
    .split(/[;,/|&+]+|\s+AND\s+/i)
    .map((role) => role.trim())
    .filter(Boolean);

  return {
    ...input,
    legalName: values.legalName ?? input.legalName,
    displayName: values.displayName ?? input.displayName ?? null,
    email: values.email ?? input.email ?? null,
    phone: values.phone ?? input.phone ?? null,
    roles,
    taxRegistrations,
    addresses,
    bankAccounts,
  };
}

export function applyContactCorrection(
  input: ContactInput,
  values: Record<string, string>,
): ContactInput {
  return parseContactInput(createContactCorrectionDraft(input, values)) as ContactInput;
}
