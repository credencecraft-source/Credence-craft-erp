const INDIAN_MOBILE_PATTERN = /^91[6-9]\d{9}$/;
const INDIAN_NATIONAL_MOBILE_PATTERN = /^[6-9]\d{9}$/;

export function isValidIndianNationalMobileNumber(value: string) {
  return INDIAN_NATIONAL_MOBILE_PATTERN.test(value);
}

export function getCanonicalIndianMobileNumber(value: string | null | undefined) {
  let digits = value?.trim().replace(/^p:/i, "").replace(/\D/g, "") ?? "";
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return INDIAN_MOBILE_PATTERN.test(digits) ? digits : null;
}

export function normalizeIndianMobileNumber(value: string) {
  const normalized = getCanonicalIndianMobileNumber(value);
  if (!normalized) {
    throw new Error("Mobile number must be 12 digits: 91 followed by a 10-digit Indian mobile number, without +.");
  }
  return normalized;
}

export function formatIndianMobileNumber(value: string | null) {
  if (!value) return null;
  return getCanonicalIndianMobileNumber(value) ?? value.trim();
}

export function getIndianMobileNumberLookupVariants(value: string) {
  const canonical = normalizeIndianMobileNumber(value);
  const national = canonical.slice(2);
  return [...new Set([
    canonical,
    `+${canonical}`,
    national,
    `91 ${national}`,
    `+91 ${national}`,
    `91-${national}`,
    `+91-${national}`,
    `+91 (${national.slice(0, 5)}) ${national.slice(5)}`,
  ])];
}
