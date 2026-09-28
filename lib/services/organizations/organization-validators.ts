import { isValidEmail, normalizeDisplayText, normalizeEmail } from "@/lib/auth/validation-rules";

export type OrganizationInput = {
  organizationName: string;
  organizationEmail?: string;
  gstNumber: string;
  mobileNo?: string;
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
    organizationName: normalizeDisplayText(input.organizationName),
    organizationEmail: normalizeEmail(input.organizationEmail ?? ""),
    gstNumber: String(input.gstNumber || "").trim().toUpperCase(),
    mobileNo: String(input.mobileNo || "").trim(),
    addressLine1: normalizeDisplayText(input.addressLine1),
    addressLine2: normalizeDisplayText(input.addressLine2),
    city: normalizeDisplayText(input.city),
    state: normalizeDisplayText(input.state),
    country: normalizeDisplayText(input.country),
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

  if (normalized.organizationEmail && (
    normalized.organizationEmail.length > 320
    || !isValidEmail(normalized.organizationEmail)
  )) {
    throw new Error("Organization email must be a valid email address of 320 characters or fewer.");
  }

  if (!GSTIN_PATTERN.test(normalized.gstNumber)) {
    throw new Error("GST number must be in valid GSTIN format.");
  }

  if (normalized.mobileNo.length > 50) {
    throw new Error("Mobile number must be 50 characters or fewer.");
  }

  return normalized;
}
