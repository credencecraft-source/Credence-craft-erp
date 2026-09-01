export const DEV_OTP = process.env.DEV_OTP || "1234";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeProfileName(value: string) {
  return String(value || "").trim();
}

export function normalizeFullName(value: string) {
  return String(value || "").trim();
}

export function isValidEmail(value: string) {
  const normalized = normalizeEmail(value);
  return Boolean(normalized) && EMAIL_PATTERN.test(normalized);
}

export function isValidProfileName(value: string) {
  const normalized = normalizeProfileName(value);
  return Boolean(normalized) && normalized.length >= 2 && normalized.length <= 100;
}

export function isValidFullName(value: string) {
  const normalized = normalizeFullName(value);
  return Boolean(normalized) && normalized.length >= 2 && normalized.length <= 255;
}
