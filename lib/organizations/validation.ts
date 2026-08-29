export type OrganizationInput = {
  organizationName: string;
  gstNumber: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
};

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function normalizeOrganizationInput(input: OrganizationInput) {
  return {
    organizationName: String(input.organizationName || "").trim(),
    gstNumber: String(input.gstNumber || "").trim().toUpperCase(),
    addressLine1: String(input.addressLine1 || "").trim(),
    addressLine2: String(input.addressLine2 || "").trim(),
    city: String(input.city || "").trim(),
    state: String(input.state || "").trim(),
    country: String(input.country || "").trim(),
    pinCode: String(input.pinCode || "").trim(),
  };
}

export function validateOrganizationInput(input: OrganizationInput) {
  const normalized = normalizeOrganizationInput(input);

  if (!normalized.organizationName) {
    throw new Error("Organization name is required.");
  }

  if (!normalized.gstNumber) {
    throw new Error("GST number is required.");
  }

  if (!GSTIN_PATTERN.test(normalized.gstNumber)) {
    throw new Error("GST number must be in valid GSTIN format.");
  }

  return normalized;
}
