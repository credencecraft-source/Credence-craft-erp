import * as XLSX from "xlsx";

import { describe, expect, it } from "vitest";

import type { MasterDefinition } from "@/lib/master-data/master-data-models";
import {
  getRetryableMasterWorkbookRows,
  parseMasterRecordsWorkbook,
  validateCorrectedMasterWorkbookRows,
  validateMasterWorkbookLookupValues,
  type ParsedMasterWorkbookRow,
} from "@/lib/master-data/master-records-workbook";

const definition: MasterDefinition = {
  key: "sample",
  label: "Sample Master",
  description: "Test master",
  labelField: "name",
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "ratio", label: "Ratio", type: "percentage" },
    { key: "enabled", label: "Enabled", type: "checkbox" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "referenceUrl", label: "Reference URL", type: "url" },
    {
      key: "steps",
      label: "Steps",
      type: "child-list",
      childFields: [
        { key: "stepName", label: "Step Name", type: "text", required: true },
        { key: "sequence", label: "Sequence", type: "number", required: true },
        { key: "cost", label: "Cost", type: "decimal" },
      ],
    },
  ],
};

function workbookFile(rows: unknown[][], name = "sample.xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Data");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([bytes], name);
}

describe("parseMasterRecordsWorkbook", () => {
  it("parses configured fields and child rows from an Excel sheet", async () => {
    const file = workbookFile([
      ["Name", "Ratio", "Enabled", "Due Date", "Reference URL", "Steps", "Master Code", "Description"],
      ["sample contact", "12.5", "TRUE", "2026-04-09", "https://example.com/item", JSON.stringify([{ "Step Name": "cut", Sequence: "1", Cost: "0.10" }]), "s-1", "test record"],
    ]);

    await expect(parseMasterRecordsWorkbook(file, definition)).resolves.toEqual([
      {
        rowNumber: 2,
        code: "S-1",
        description: "TEST RECORD",
        fields: {
          name: "SAMPLE CONTACT",
          ratio: 12.5,
          enabled: true,
          dueDate: "2026-04-09",
          referenceUrl: "https://example.com/item",
        },
        childRows: {
          steps: [{ stepName: "CUT", sequence: 1, cost: "0.10" }],
        },
      },
    ]);
  });

  it("rejects missing required columns and invalid field values", async () => {
    const missingColumn = workbookFile([["Ratio"], ["10"]]);
    await expect(parseMasterRecordsWorkbook(missingColumn, definition))
      .rejects.toThrow('missing its required "Name" column');

    const invalidValue = workbookFile([
      ["Name", "Ratio"],
      ["sample", "101"],
    ]);
    await expect(parseMasterRecordsWorkbook(invalidValue, definition))
      .rejects.toThrow("Ratio must be between 0 and 100");

    const invalidUrl = workbookFile([
      ["Name", "Reference URL"],
      ["sample", "javascript:alert(1)"],
    ]);
    await expect(parseMasterRecordsWorkbook(invalidUrl, definition))
      .rejects.toThrow("Reference URL must be an http or https URL");
  });

  it("rejects unsupported workbook formats, extra columns, and empty imports", async () => {
    await expect(parseMasterRecordsWorkbook(workbookFile([["Name"], ["sample"]], "sample.csv"), definition))
      .rejects.toThrow("Choose an .xlsx workbook");

    await expect(parseMasterRecordsWorkbook(workbookFile([["Name", "Unexpected"], ["sample", "value"]]), definition))
      .rejects.toThrow('unknown column: "Unexpected"');

    await expect(parseMasterRecordsWorkbook(workbookFile([["Name"]]), definition))
      .rejects.toThrow("no data rows to import");
  });

  it("keeps invalid rows editable and validates their corrected values before retry", async () => {
    const parsed = await parseMasterRecordsWorkbook(workbookFile([
      ["Name", "Ratio"],
      ["valid", "25"],
      ["invalid", "101"],
    ]), definition, true);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0].row.fields.ratio).toBe("101");
    expect(parsed.failures[0].message).toContain("Ratio must be between 0 and 100");

    const corrected = validateCorrectedMasterWorkbookRows([{
      ...parsed.failures[0].row,
      fields: { ...parsed.failures[0].row.fields, ratio: "75" },
    }], definition);
    expect(corrected).toHaveLength(1);
    expect(corrected[0].fields).toEqual({
      name: "INVALID",
      ratio: 75,
      enabled: false,
      dueDate: null,
      referenceUrl: null,
    });
  });

  it("only returns failed rows for a partial-success retry", () => {
    const failedRow = {
      rowNumber: 3,
      code: null,
      description: null,
      fields: { name: "FAILED" },
      childRows: {},
    };
    expect(getRetryableMasterWorkbookRows([
      { rowNumber: 2, message: "Created" },
      { rowNumber: 3, message: "Duplicate name", row: failedRow },
    ])).toEqual([{ rowNumber: 3, message: "Duplicate name", row: failedRow }]);
  });

  it("resolves tenant-validated lookup labels to IDs and enforces parent matching", async () => {
    const lookupDefinition: MasterDefinition = {
      key: "sub-category",
      label: "Subcategory",
      description: "Subcategory master",
      fields: [
        { key: "category", label: "Category", type: "lookup", lookupModuleKey: "category", required: true },
        { key: "subcategory", label: "Subcategory", type: "lookup", lookupModuleKey: "sub-category", dependsOn: "category", required: true },
      ],
    };
    const rows: ParsedMasterWorkbookRow[] = [{
      rowNumber: 2,
      code: null,
      description: null,
      fields: { category: "APPAREL", subcategory: "TOPS" },
      childRows: {},
    }];
    const resolver = async (moduleKey: string, value: string) => {
      if (moduleKey === "category" && (value === "APPAREL" || value === "category-1")) {
        return [{ id: "category-1", label: "APPAREL" }];
      }
      if (moduleKey === "sub-category" && (value === "TOPS" || value === "subcategory-1")) {
        return [{ id: "subcategory-1", label: "TOPS", parent_id: "category-1" }];
      }
      return [];
    };

    await validateMasterWorkbookLookupValues(lookupDefinition, rows, resolver);
    expect(rows[0].fields).toEqual({ category: "category-1", subcategory: "subcategory-1" });

    const mismatchedRows: ParsedMasterWorkbookRow[] = [{
      ...rows[0],
      fields: { category: "APPAREL", subcategory: "TOPS" },
    }];
    await expect(validateMasterWorkbookLookupValues(
      lookupDefinition,
      mismatchedRows,
      async (moduleKey, value) => {
        if (moduleKey === "category" && (value === "APPAREL" || value === "category-2")) {
          return [{ id: "category-2", label: "APPAREL" }];
        }
        return resolver(moduleKey, value);
      },
    )).rejects.toThrow("Subcategory must belong to the selected Category");
  });
});
