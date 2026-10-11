import { describe, expect, it } from "vitest";

import {
  filterMasterOptionsByParent,
  findMasterSelectionOption,
  getMasterSelectionLabel,
} from "./master-data-selection";

const colors = [
  { id: "color-1", value_id: "color-value-1", label: "Navy Blue" },
  { id: "color-2", value_id: "color-value-2", label: "Black" },
];

describe("master selection values", () => {
  it.each([
    ["id", "color-1"],
    ["value id", "color-value-1"],
    ["label", "Navy Blue"],
    ["case-insensitive label", "navy blue"],
  ])("resolves a master by %s", (_kind, value) => {
    expect(findMasterSelectionOption(colors, value)?.label).toBe("Navy Blue");
    expect(getMasterSelectionLabel(colors, value)).toBe("Navy Blue");
  });

  it("preserves values that no longer exist in the master", () => {
    expect(getMasterSelectionLabel(colors, "Legacy Color")).toBe("Legacy Color");
  });

  it("filters dependent master values for either parent id representation", () => {
    const categories = [
      { id: "category-1", value_id: "category-value-1", label: "Tops" },
      { id: "category-2", value_id: "category-value-2", label: "Bottoms" },
    ];
    const subcategories = [
      { id: "sub-1", label: "Shirts", parent_id: "category-1" },
      { id: "sub-2", label: "Trousers", parentValueId: "category-value-2" },
    ];

    expect(filterMasterOptionsByParent(subcategories, categories, "category-value-1").map((item) => item.label)).toEqual(["Shirts"]);
    expect(filterMasterOptionsByParent(subcategories, categories, "category-1").map((item) => item.label)).toEqual(["Shirts"]);
    expect(filterMasterOptionsByParent(subcategories, categories, "Bottoms").map((item) => item.label)).toEqual(["Trousers"]);
  });
});
