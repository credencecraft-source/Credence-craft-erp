import { normalizeUppercase } from "@/lib/utilities/text-case";

function normalizeSkuPart(value: string | null | undefined) {
  return normalizeUppercase(value ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildFinishedGoodsSkuCode(
  styleName: string | null | undefined,
  color: string | null | undefined,
  size: string | null | undefined,
) {
  const parts = [styleName, color, size].map(normalizeSkuPart);
  if (parts.some((part) => !part)) return null;

  const skuCode = parts.join("-");
  return skuCode.length <= 50 ? skuCode : null;
}
