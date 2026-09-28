const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeDisplayText(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (raw.includes("@")) {
    return raw.toLowerCase();
  }

  const compact = raw.replace(/\s+/g, " ");
  return compact
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (!word) return word;
      const sanitized = word.replace(/[^\p{L}\p{N}'’.-]/gu, "");
      if (!sanitized) return word;
      return sanitized.charAt(0).toUpperCase() + sanitized.slice(1).toLowerCase();
    })
    .join(" ");
}

export function normalizeStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const normalizedKey = normalizeSystemStatusKey(raw);
  if (normalizedKey) {
    return normalizedKey
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  return normalizeDisplayText(raw);
}

export function normalizeSystemStatusKey(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const collapsed = raw
    .replace(/[_\-\s]+/g, " ")
    .trim();

  if (!collapsed) return "";

  const tokenized = collapsed.split(" ").filter(Boolean);
  const cleaned = tokenized
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .map((part) => part.toUpperCase());

  return cleaned.join("_");
}

export function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeProfileName(value: string) {
  return normalizeDisplayText(value);
}

export function normalizeFullName(value: string) {
  return normalizeDisplayText(value);
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
