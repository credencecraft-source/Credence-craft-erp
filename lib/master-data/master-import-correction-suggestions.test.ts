import { describe, expect, it } from "vitest";

import { readRelatedMasterSuggestions } from "./master-import-correction-suggestions";

describe("readRelatedMasterSuggestions", () => {
  it("offers a hierarchy action for previously saved category mismatch errors", () => {
    expect(readRelatedMasterSuggestions({
      fields: {
        Category: "COORD SET",
        Subcategory: "INDIGO DENIM",
      },
      validationErrors: [{
        message: 'Finished Goods Subcategory "INDIGO DENIM" belongs to a different Finished Goods Category than "COORD SET".',
        fieldPaths: ["Category", "Subcategory"],
      }],
    })).toEqual([
      {
        moduleKey: "category",
        label: "INDIGO DENIM",
        fields: { Product_Master: "", Category_Name: "INDIGO DENIM" },
        articleFieldUpdates: { Category: "INDIGO DENIM" },
        action: "create-category-subcategory-pair",
      },
      {
        moduleKey: "sub-category",
        label: "COORD SET",
        fields: { category: "INDIGO DENIM", sub_category: "COORD SET" },
        articleFieldUpdates: { Subcategory: "COORD SET" },
        action: "create-category-subcategory-pair",
      },
    ]);
  });

  it("preserves suggestions attached to a newly validated error", () => {
    expect(readRelatedMasterSuggestions({
      fields: { Category: "COORD SET", Subcategory: "INDIGO DENIM" },
      validationErrors: [{
        message: "Category mismatch.",
        relatedMasters: [{
          moduleKey: "category",
          label: "INDIGO DENIM",
          fields: { Category_Name: "INDIGO DENIM" },
          action: "create-category-subcategory-pair",
        }],
      }],
    })).toHaveLength(1);
  });

  it("adds the hierarchy action alongside unrelated saved master suggestions", () => {
    expect(readRelatedMasterSuggestions({
      fields: { Category: "COORD SET", Subcategory: "INDIGO DENIM" },
      validationErrors: [{
        message: 'Finished Goods Subcategory "INDIGO DENIM" belongs to a different Finished Goods Category than "COORD SET".',
        relatedMasters: [{
          moduleKey: "brand",
          label: "ACME",
          fields: { Brand: "ACME" },
        }],
      }],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ moduleKey: "brand", label: "ACME" }),
      expect.objectContaining({
        moduleKey: "category",
        label: "INDIGO DENIM",
        action: "create-category-subcategory-pair",
      }),
      expect.objectContaining({
        moduleKey: "sub-category",
        label: "COORD SET",
        action: "create-category-subcategory-pair",
      }),
    ]));
  });
});
