import XlsxPopulate from "xlsx-populate";

import { describe, expect, it } from "vitest";

import {
  createMasterRecordsTemplateWorkbook,
  type MasterWorkbookLookupOption,
} from "@/lib/master-data/master-records-template-workbook";

describe("master records template workbook", () => {
  it("exports existing lookup labels and adds dropdowns for lookups, dependent lookups, and picklists", async () => {
    const categories: MasterWorkbookLookupOption[] = [
      { id: "category-1", value_id: "category-value-1", label: "APPAREL" },
      { id: "category-2", value_id: "category-value-2", label: "FOOTWEAR" },
    ];
    const workbookBytes = await createMasterRecordsTemplateWorkbook({
      moduleLabel: "Sample Master",
      records: [{
        id: "record-1",
        code: "SM-001",
        description: "Sample",
        metadata: { fields: { category: "category-value-1", subcategory: "subcategory-1", status: "ACTIVE" } },
      }],
      fields: [
        { key: "category", label: "Category", type: "lookup", lookupModuleKey: "category" },
        { key: "subcategory", label: "Subcategory", type: "lookup", lookupModuleKey: "sub-category", dependsOn: "category" },
        { key: "status", label: "Status", type: "picklist", options: ["ACTIVE", "INACTIVE"] },
      ],
      lookupOptions: {
        category: categories,
        "sub-category": [
          { id: "subcategory-1", label: "TOPS", parent_id: "category-1" },
          { id: "subcategory-2", label: "SHOES", parent_id: "category-2" },
        ],
      },
      childRecords: [],
    });
    const workbook = await XlsxPopulate.fromDataAsync(workbookBytes);
    const dataSheet = workbook.sheet("Data");
    const lookupsSheet = workbook.sheet("Lookups");

    expect(dataSheet.range("A2:C2").value()).toEqual([["APPAREL", "TOPS", "ACTIVE"]]);
    expect(dataSheet.range("A2:A501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "MasterLookup1",
    });
    expect(dataSheet.range("B2:B501").dataValidation()).toMatchObject({
      type: "list",
      formula1: 'INDIRECT("MasterLookup2Parent"&MATCH($A2,MasterLookupParent2,0))',
    });
    expect(dataSheet.range("C2:C501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "MasterPicklist3",
    });
    expect(lookupsSheet.hidden()).toBe(true);
    expect(lookupsSheet.range("F2:F3").value()).toEqual([["APPAREL"], ["FOOTWEAR"]]);
    expect(lookupsSheet.range("G2:G3").value()).toEqual([["APPAREL"], ["FOOTWEAR"]]);
    expect(lookupsSheet.range("H2:H2").value()).toEqual([["TOPS"]]);
    expect(lookupsSheet.range("I2:I2").value()).toEqual([["SHOES"]]);
  });

  it("creates a blank workbook with ready-to-use dropdown rows", async () => {
    const workbookBytes = await createMasterRecordsTemplateWorkbook({
      moduleLabel: "Blank Master",
      records: [],
      fields: [{ key: "unit", label: "Unit", type: "lookup", lookupModuleKey: "uom" }],
      lookupOptions: { uom: [{ id: "unit-1", label: "PIECE" }] },
      childRecords: [],
    });
    const workbook = await XlsxPopulate.fromDataAsync(workbookBytes);

    expect(workbook.sheet("Data").range("A2:A501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "MasterLookup1",
    });
  });
});
