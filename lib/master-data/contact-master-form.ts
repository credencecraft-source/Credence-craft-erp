export type AddressUsage = "BILLING" | "SHIPPING" | "BOTH";

export type ContactData = {
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
    tax_registration: { gstin: string } | null;
    label: string | null;
    usage: AddressUsage;
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
  bank_accounts?: Array<{
    id: string;
    account_holder_name?: string;
    account_number_masked: string;
    ifsc_code?: string;
    bank_name?: string;
    branch?: string | null;
    is_default?: boolean;
  }>;
};

export type ContactSaveResponse = ContactData | { id: string; phone: string | null };

export type ContactForm = {
  code: string;
  legalName: string;
  displayName: string;
  email: string;
  phone: string;
  isActive: boolean;
  roles: string[];
  taxRegistrations: Array<{ gstin: string; legalName: string; registrationType: string; status: string }>;
  addresses: Array<{
    id?: string;
    taxRegistrationGstin: string;
    label: string;
    usage: AddressUsage;
    addressLine1: string;
    addressLine2: string;
    city: string;
    stateName: string;
    stateCode: string;
    postalCode: string;
    countryCode: string;
    isDefaultBilling: boolean;
    isDefaultShipping: boolean;
  }>;
  bankAccounts: Array<{
    id?: string;
    accountHolderName: string;
    accountNumber: string;
    accountNumberMasked?: string;
    ifscCode: string;
    bankName: string;
    branch: string;
    isDefault: boolean;
  }>;
};

export function mergeContactSaveResponse(
  current: ContactData | null,
  response: ContactSaveResponse,
): ContactData {
  if ("legal_name" in response) return response;
  if (!current || current.id !== response.id) {
    throw new Error("Updated contact data could not be reconciled.");
  }
  return { ...current, phone: response.phone };
}

export function emptyContactForm(): ContactForm {
  return {
    code: "",
    legalName: "",
    displayName: "",
    email: "",
    phone: "",
    isActive: true,
    roles: [],
    taxRegistrations: [],
    addresses: [],
    bankAccounts: [],
  };
}

export function toContactForm(contact: ContactData): ContactForm {
  return {
    code: contact.code,
    legalName: contact.legal_name,
    displayName: contact.display_name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    isActive: contact.is_active,
    roles: contact.roles.map((role) => role.role_code),
    taxRegistrations: contact.tax_registrations.map((registration) => ({
      gstin: registration.gstin,
      legalName: registration.legal_name,
      registrationType: registration.registration_type,
      status: registration.status,
    })),
    addresses: contact.addresses.map((address) => ({
      id: address.id,
      taxRegistrationGstin: address.tax_registration?.gstin ?? "",
      label: address.label ?? "",
      usage: address.usage,
      addressLine1: address.address_line_1,
      addressLine2: address.address_line_2 ?? "",
      city: address.city,
      stateName: address.state_name,
      stateCode: address.state_code ?? "",
      postalCode: address.postal_code,
      countryCode: address.country_code || "IN",
      isDefaultBilling: address.is_default_billing,
      isDefaultShipping: address.is_default_shipping,
    })),
    bankAccounts: (contact.bank_accounts ?? []).map((account) => ({
      id: account.id,
      accountHolderName: account.account_holder_name ?? "",
      accountNumber: "",
      accountNumberMasked: account.account_number_masked,
      ifscCode: account.ifsc_code ?? "",
      bankName: account.bank_name ?? "",
      branch: account.branch ?? "",
      isDefault: account.is_default ?? false,
    })),
  };
}

export function buildContactSavePayload(form: ContactForm, original?: ContactForm) {
  const payload: Record<string, unknown> = {};
  const changed = <T>(current: T, previous: T | undefined) =>
    previous === undefined || JSON.stringify(current) !== JSON.stringify(previous);

  if (changed(form.legalName, original?.legalName)) payload.legalName = form.legalName;
  if (changed(form.displayName, original?.displayName)) payload.displayName = form.displayName || null;
  if (changed(form.email, original?.email)) payload.email = form.email || null;
  if (changed(form.phone, original?.phone)) payload.phone = form.phone || null;
  if (changed(form.isActive, original?.isActive)) payload.isActive = form.isActive;
  if (changed(form.roles, original?.roles)) payload.roles = form.roles;
  if (changed(form.taxRegistrations, original?.taxRegistrations)) payload.taxRegistrations = form.taxRegistrations;
  if (changed(form.addresses, original?.addresses)) payload.addresses = form.addresses;
  if (changed(form.bankAccounts, original?.bankAccounts)) {
    payload.bankAccounts = form.bankAccounts.map(({
      id,
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      branch,
      isDefault,
    }) => ({
      id,
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      branch,
      isDefault,
    }));
  }
  return payload;
}
