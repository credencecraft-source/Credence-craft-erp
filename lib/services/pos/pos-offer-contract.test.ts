import { describe, expect, it } from "vitest";

import {
  getPosOfferScopeBySlug,
  getPosOfferTypeBySlug,
  isPosOfferStatus,
  POS_OFFER_SCOPE_OPTIONS,
  POS_OFFER_TYPE_OPTIONS,
} from "./pos-offer-contract";

describe("POS offer contract", () => {
  it("maps offer type URLs to supported record types", () => {
    expect(POS_OFFER_TYPE_OPTIONS.map(({ slug, value }) => [slug, value])).toEqual([
      ["flat-amount", "FLAT_AMOUNT"],
      ["percentage", "PERCENTAGE"],
      ["buy-one-get-one", "BUY_ONE_GET_ONE"],
      ["combo", "COMBO"],
    ]);
    expect(getPosOfferTypeBySlug("percentage")?.value).toBe("PERCENTAGE");
    expect(getPosOfferTypeBySlug("unknown")).toBeUndefined();
  });

  it("maps scope URLs and validates lifecycle statuses", () => {
    expect(POS_OFFER_SCOPE_OPTIONS.map(({ slug, value }) => [slug, value])).toEqual([
      ["category", "CATEGORY"],
      ["colour", "COLOUR"],
      ["size", "SIZE"],
      ["all", "ALL"],
    ]);
    expect(getPosOfferScopeBySlug("colour")?.value).toBe("COLOUR");
    expect(getPosOfferScopeBySlug("unknown")).toBeUndefined();
    expect(isPosOfferStatus("DRAFT")).toBe(true);
    expect(isPosOfferStatus("POSTED")).toBe(false);
  });
});
