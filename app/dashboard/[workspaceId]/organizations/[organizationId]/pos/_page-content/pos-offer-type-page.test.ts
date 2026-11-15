import { describe, expect, it } from "vitest";

import {
  POS_OFFER_SCOPE_OPTIONS,
  POS_OFFER_TYPE_OPTIONS,
} from "@/lib/services/pos/pos-offer-contract";

describe("POS offer selection routes", () => {
  it("provides each requested offer scope", () => {
    expect(POS_OFFER_SCOPE_OPTIONS.map(({ slug }) => slug)).toEqual([
      "category",
      "colour",
      "size",
      "all",
    ]);
  });

  it("provides the supported offer type slugs", () => {
    expect(POS_OFFER_TYPE_OPTIONS.map(({ slug }) => slug)).toEqual([
      "flat-amount",
      "percentage",
      "buy-one-get-one",
      "combo",
    ]);
  });
});
