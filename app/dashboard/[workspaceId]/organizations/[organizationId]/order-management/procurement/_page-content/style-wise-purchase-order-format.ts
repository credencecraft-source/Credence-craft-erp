export const formatNumber = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const text = (value: unknown, fallback = "-") =>
  value === null || value === undefined || value === ""
    ? fallback
    : String(value);

export function registrationStateCode(
  state: string | null | undefined,
  gstin: string | null | undefined,
) {
  const normalizedGstin = String(gstin ?? "")
    .trim()
    .toUpperCase();
  if (/^\d{2}[A-Z0-9]{13}$/.test(normalizedGstin))
    return normalizedGstin.slice(0, 2);
  return String(state ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.\-]+/g, " ")
    .replace(/\s+/g, " ");
}
