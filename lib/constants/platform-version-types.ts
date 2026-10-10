import type { PlatformVersionType } from "@prisma/client";

export const PLATFORM_VERSION_TYPE_OPTIONS = [
  { value: "BEST_PRICE", label: "Best Price" },
  { value: "REGULAR_PRICE", label: "Regular Price" },
  { value: "PREMIUM", label: "Premium" },
] satisfies { value: PlatformVersionType; label: string }[];

const PLATFORM_VERSION_TYPE_LABELS: Record<PlatformVersionType, string> = {
  BEST_PRICE: "Best Price",
  REGULAR_PRICE: "Regular Price",
  PREMIUM: "Premium",
};

export function isPlatformVersionType(value: string): value is PlatformVersionType {
  return PLATFORM_VERSION_TYPE_OPTIONS.some((option) => option.value === value);
}

export function getPlatformVersionTypeLabel(value: PlatformVersionType): string {
  return PLATFORM_VERSION_TYPE_LABELS[value];
}
