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
  it("allows a direct order to be created without an Article", () => {
    expect(getMissingRequiredOrderField(validForm, "DIRECT")).toBeNull();
  });

  it("allows a direct order to be edited without an Article", () => {
    expect(getMissingRequiredOrderField(validForm, "DIRECT")).toBeNull();
  });

  it("requires Article when editing an Article-based order", () => {
    expect(getMissingRequiredOrderField(validForm, "ARTICLE_BASED")).toBe("Article");
  });
});
