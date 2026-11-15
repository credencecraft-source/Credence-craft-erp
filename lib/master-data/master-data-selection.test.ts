import { describe, expect, it } from "vitest";

import {
  clearDependentMasterFields,
  filterMasterOptionsByParent,
  findMasterSelectionOption,
  getMasterSelectionLabel,
} from "./master-data-selection";

const colors = [
  { id: "color-1", value_id: "color-value-1", label: "Navy Blue" },
  { id: "color-2", value_id: "color-value-2", label: "Black" },
];

describe("master selection values", () => {
  it("clears dependent descendants while preserving unrelated form values", () => {
    const values = {
      Product_Master: "Type A",
      Category: "Shirts",
      Subcategory: "Tops",
      Size_Group: "Regular",
      Sizes: ["S", "M"],
      article: "Everyday Tee",
    };

    expect(clearDependentMasterFields(values, [
      { key: "Category", dependsOn: "Product_Master" },
      { key: "Subcategory", dependsOn: "Category" },
      { key: "Sizes", dependsOn: "Size_Group", multiple: true },
    ], "Product_Master")).toEqual({
      Product_Master: "Type A",
      Category: "",
      Subcategory: "",
      Size_Group: "Regular",
      Sizes: ["S", "M"],
      article: "Everyday Tee",
    });
  });

  it("clears multiple descendants as arrays and safely handles dependency cycles", () => {
    const values = { Parent: "A", Child: ["one"], Grandchild: "nested" };

    expect(clearDependentMasterFields(values, [
      { key: "Child", dependsOn: "Parent", multiple: true },
      { key: "Grandchild", dependsOn: "Child" },
      { key: "Parent", dependsOn: "Grandchild" },
    ], "Parent")).toEqual({ Parent: "A", Child: [], Grandchild: "" });
  });

  it("clears deep dependency chains and branches in one traversal", () => {
    const fields = Array.from({ length: 5_000 }, (_, index) => ({
      key: `Field_${index}`,
      dependsOn: index === 0 ? "Parent" : `Field_${index - 1}`,
      ...(index % 2 === 0 ? { multiple: true } : {}),
    })).reverse();
    const values = Object.fromEntries(fields.map((field) => [
      field.key,
      field.multiple ? ["selected"] : "selected",
    ]));

    const nextValues = clearDependentMasterFields({ Parent: "selected", ...values }, fields, "Parent");

    expect(nextValues.Parent).toBe("selected");
    expect(nextValues.Field_0).toEqual([]);
    expect(nextValues.Field_1).toBe("");
    expect(nextValues.Field_4999).toBe("");
  });

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

  it("preserves source ordering without duplicating children linked by both parent ids", () => {
    const parents = [{ id: "parent-id", value_id: "parent-value", label: "Parent" }];
    const children = [
      { id: "child-1", label: "First", parent_id: "parent-id", parentValueId: "parent-value" },
      { id: "child-2", label: "Second", parentValueId: "parent-value" },
      { id: "child-3", label: "Other", parent_id: "other-id" },
    ];

    expect(filterMasterOptionsByParent(children, parents, "Parent")).toEqual(children.slice(0, 2));
  });

  it("keeps first-match behavior for duplicate labels and exact identifiers", () => {
    const options = [
      { id: "first", label: "Shared Label" },
      { id: "Shared Label", label: "Later Exact Match" },
      { id: "third", label: " shared label " },
    ];

    expect(findMasterSelectionOption(options, "Shared Label")?.label).toBe("Shared Label");
    expect(findMasterSelectionOption(options, "SHARED LABEL")?.id).toBe("first");
  });

  it("rebuilds lookup indexes when the option array is replaced", () => {
    const initialOptions = [{ id: "same-id", label: "Initial" }];
    const refreshedOptions = [{ id: "same-id", label: "Refreshed" }];

    expect(findMasterSelectionOption(initialOptions, "same-id")?.label).toBe("Initial");
    expect(findMasterSelectionOption(refreshedOptions, "same-id")?.label).toBe("Refreshed");
  });

  it("reuses filtered option arrays for unchanged dropdown dependencies", () => {
    const parents = [{ id: "parent-id", value_id: "parent-value", label: "Parent" }];
    const children = [
      { id: "first", label: "First", parent_id: "parent-id" },
      { id: "second", label: "Second", parentValueId: "parent-value" },
      { id: "unrelated", label: "Unrelated", parent_id: "other-parent" },
    ];

    const firstResult = filterMasterOptionsByParent(children, parents, "Parent");
    const nextResult = filterMasterOptionsByParent(children, parents, "Parent");

    expect(firstResult).toEqual(children.slice(0, 2));
    expect(nextResult).toBe(firstResult);
    expect(filterMasterOptionsByParent(children, parents, "missing")).toBe(
      filterMasterOptionsByParent(children, parents, "missing"),
    );
  });

  it("refreshes cached dependent options when either source array is replaced", () => {
    const parents = [{ id: "parent-id", label: "Parent" }];
    const children = [{ id: "first", label: "First", parent_id: "parent-id" }];
    const initial = filterMasterOptionsByParent(children, parents, "Parent");
    const refreshedChildren = [{ id: "second", label: "Second", parent_id: "parent-id" }];
    const refreshedParents = [{ id: "parent-id", label: "Renamed Parent" }];

    expect(filterMasterOptionsByParent(refreshedChildren, parents, "Parent")).not.toBe(initial);
    expect(filterMasterOptionsByParent(children, refreshedParents, "Renamed Parent")).not.toBe(initial);
    expect(filterMasterOptionsByParent(children, refreshedParents, "Renamed Parent")).toEqual(children);
  });

  it("filters large dual-identifier catalogs in order and reuses the result", () => {
    const parents = [{ id: "parent-id", value_id: "parent-value", label: "Parent" }];
    const children = Array.from({ length: 20_000 }, (_, index) => ({
      id: `child-${index}`,
      label: `Child ${index}`,
      ...(index % 2 === 0 ? { parent_id: "parent-id" } : { parentValueId: "parent-value" }),
    }));

    const firstResult = filterMasterOptionsByParent(children, parents, "Parent");
    const repeatedResult = filterMasterOptionsByParent(children, parents, "Parent");

    expect(firstResult).toHaveLength(20_000);
    expect(firstResult[0]?.label).toBe("Child 0");
    expect(firstResult.at(-1)?.label).toBe("Child 19999");
    expect(repeatedResult).toBe(firstResult);
  });
});
