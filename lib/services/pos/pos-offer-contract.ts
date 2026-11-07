export const POS_OFFER_TYPE_OPTIONS = [
  {
    slug: "flat-amount",
    value: "FLAT_AMOUNT",
    label: "Flat Amount",
    description: "Apply a fixed amount discount.",
  },
  {
    slug: "percentage",
    value: "PERCENTAGE",
    label: "Percentage",
    description: "Apply a percentage-based discount.",
  },
  {
    slug: "buy-one-get-one",
    value: "BUY_ONE_GET_ONE",
    label: "Buy One Get One",
    description: "Offer a free item with a qualifying purchase.",
  },
  {
    slug: "combo",
    value: "COMBO",
    label: "Combo",
    description: "Offer a bundled combination of items.",
  },
] as const;

export const POS_OFFER_SCOPE_OPTIONS = [
  {
    slug: "category",
    value: "CATEGORY",
    label: "Category",
    description: "Apply this offer to selected categories.",
  },
  {
    slug: "colour",
    value: "COLOUR",
    label: "Colour",
    description: "Apply this offer to selected colours.",
  },
  {
    slug: "size",
    value: "SIZE",
    label: "Size",
    description: "Apply this offer to selected sizes.",
  },
  {
    slug: "all",
    value: "ALL",
    label: "For All",
    description: "Apply this offer to all eligible items.",
  },
] as const;

export const POS_OFFER_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

export type PosOfferTypeCode = (typeof POS_OFFER_TYPE_OPTIONS)[number]["value"];
export type PosOfferScopeCode = (typeof POS_OFFER_SCOPE_OPTIONS)[number]["value"];
export type PosOfferStatusCode = (typeof POS_OFFER_STATUS_OPTIONS)[number]["value"];
export type PosOfferTypeOption = (typeof POS_OFFER_TYPE_OPTIONS)[number];
export type PosOfferScopeOption = (typeof POS_OFFER_SCOPE_OPTIONS)[number];

export function getPosOfferTypeBySlug(slug: string) {
  return POS_OFFER_TYPE_OPTIONS.find((option) => option.slug === slug);
}

export function getPosOfferScopeBySlug(slug: string) {
  return POS_OFFER_SCOPE_OPTIONS.find((option) => option.slug === slug);
}

export function isPosOfferStatus(value: string): value is PosOfferStatusCode {
  return POS_OFFER_STATUS_OPTIONS.some((option) => option.value === value);
}
