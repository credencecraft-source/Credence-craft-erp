import { getCanonicalIndianMobileNumber } from "./indian-mobile-number";

const INTERNATIONAL_MOBILE_PATTERN = /^[1-9]\d{6,14}$/;

export function normalizeInternationalMobileNumber(
  value: string | null | undefined,
) {
  const input = value?.trim() ?? "";
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return null;
  const digits = input.replace(/\D/g, "");
  if (!INTERNATIONAL_MOBILE_PATTERN.test(digits)) return null;
  if (
    digits.startsWith("91") &&
    getCanonicalIndianMobileNumber(digits) !== digits
  ) {
    return null;
  }
  return digits;
}

export function isValidInternationalMobileNumber(
  value: string | null | undefined,
) {
  return normalizeInternationalMobileNumber(value) !== null;
}
