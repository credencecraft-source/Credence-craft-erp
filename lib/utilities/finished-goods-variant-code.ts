export const MAX_VARIANT_CODE_LENGTH = 100;

export function normalizeVariantCodePart(value: string) {
  return value
    .normalize("NFKD")
    .toUpperCase()
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildStyleColorVariantCode(
  styleName: string | null | undefined,
  color: string | null | undefined,
) {
  const styleCode = normalizeVariantCodePart(styleName ?? "");
  const colorCode = normalizeVariantCodePart(color ?? "");
  if (!styleCode || !colorCode) return null;

  return `${styleCode}-${colorCode}`;
}

export function buildPersistedOrderVariantCode(
  styleName: string | null | undefined,
  color: string | null | undefined,
) {
  const code = buildStyleColorVariantCode(styleName, color);
  if (code && code.length > MAX_VARIANT_CODE_LENGTH) {
    throw new Error(`Style Name and Colour produce a Variant Code longer than ${MAX_VARIANT_CODE_LENGTH} characters.`);
  }
  return code;
}
