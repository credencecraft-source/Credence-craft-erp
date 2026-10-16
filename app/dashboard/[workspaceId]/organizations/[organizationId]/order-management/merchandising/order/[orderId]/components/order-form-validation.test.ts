import { describe, expect, it } from "vitest";

import { getMissingRequiredOrderField } from "./order-form-validation";

const validForm = {
  article: "",
  buyer: "Buyer",
  brand: "Brand",
  category: "Category",
  colors: "Blue",
  deliveryDate: "2026-12-15",
  entityName: "Factory",
  haveSizeRatio: false,
  ratioOrderQty: "",
  season: "Winter",
  sizeGroup: "Standard",
  styleName: "Oxford",
  subCategory: "Casual",
};

describe("getMissingRequiredOrderField", () => {
  it("allows a direct create order without an Article", () => {
    expect(getMissingRequiredOrderField(validForm, false)).toBeNull();
  });

  it("still requires Article when editing an order", () => {
    expect(getMissingRequiredOrderField(validForm, true)).toBe("Article");
  });
});
