import { describe, expect, it } from "vitest";
import { getMasterDefinition } from "./master-data-registry";
import { getMissingRequiredFieldLabels, getRequiredFieldsErrorMessage } from "./required-field-validation";

describe("required master field validation messages", () => {
  const fields = [
    { key: "Category", label: "Raw Material Category", required: true },
    { key: "Subcategory", label: "Raw Material Sub Category", required: true, dependsOn: "Category" },
    { key: "Category_Type", label: "Raw Material Type" },
    { key: "Raw_Material_Name", label: "Raw Material Name", required: true },
    { key: "Stock_Uom1", label: "Stock UOM", required: true },
  ];

  it("reports missing required field labels and suppresses fields blocked by a missing parent", () => {
    const missingLabels = getMissingRequiredFieldLabels({
      Category: "",
      Subcategory: "",
      Category_Type: "",
      Raw_Material_Name: "",
      Stock_Uom1: "",
    }, fields, "Raw_Material_Name");

    expect(missingLabels).toEqual([
      "Raw Material Category",
      "Raw Material Name",
      "Stock UOM",
    ]);
    expect(getRequiredFieldsErrorMessage(missingLabels)).toBe(
      "Please complete the following required fields: Raw Material Category, Raw Material Name, Stock UOM.",
    );
  });

  it("reports a missing dependent field once its parent is selected", () => {
    expect(getMissingRequiredFieldLabels({
      Category: "category-id",
      Subcategory: "",
      Category_Type: "type-id",
      Raw_Material_Name: "ITEM",
      Stock_Uom1: "uom-id",
    }, fields, "Raw_Material_Name")).toEqual(["Raw Material Sub Category"]);
  });

  it("does not require Raw Material Type when it is derived from the selected category", () => {
    expect(getMissingRequiredFieldLabels({
      Category: "category-id",
      Category_Type: "",
      Subcategory: "sub-category-id",
      Raw_Material_Name: "ITEM",
      Stock_Uom1: "uom-id",
    }, fields, "Raw_Material_Name")).toEqual([]);
  });

  it("does not require any optional dependent lookup when its parent is selected", () => {
    expect(getMissingRequiredFieldLabels({
      Category: "category-id",
      Category_Type: "",
      Subcategory: "sub-category-id",
      Raw_Material_Name: "ITEM",
      Stock_Uom1: "uom-id",
    }, [
      { key: "Category", label: "Raw Material Category", required: true },
      { key: "Category_Type", label: "Raw Material Type", dependsOn: "Category" },
      { key: "Raw_Material_Name", label: "Raw Material Name", required: true },
      { key: "Stock_Uom1", label: "Stock UOM", required: true },
    ], "Raw_Material_Name")).toEqual([]);
  });

  it("uses the Raw Material master definition without requiring its category-linked type", () => {
    const definition = getMasterDefinition("raw-material");
    expect(definition).toBeDefined();
    expect(getMissingRequiredFieldLabels({
      Category: "category-id",
      Subcategory: "sub-category-id",
      Raw_Material_Name: "ITEM",
      Stock_Uom1: "uom-id",
    }, definition!.fields, definition!.labelField ?? definition!.fields[0]?.key))
      .not.toContain("Raw Material Type");
  });
});
