import { describe, expect, it } from "vitest";

import { groupArticleMatrixRows } from "./article-import-workbook";

describe("groupArticleMatrixRows", () => {
  it("combines repeated article rows into one style with distinct sizes and colors", () => {
    const result = groupArticleMatrixRows([
      {
        rowNumber: 2,
        code: null,
        description: null,
        fields: {
          article: "FW66",
          Brand: "LABEL",
          Product_Master: "FINISHED GOODS",
          Category: "KURTI",
          Subcategory: "FASHION KURTI",
          Sizes: ["S"],
          Size_Group: null,
        },
        childRows: { variants: [{ color: "BLACK", variant_code: null, sku: null, price_override: null }] },
      },
      {
        rowNumber: 3,
        code: null,
        description: null,
        fields: {
          article: "FW66",
          Brand: "LABEL",
          Product_Master: "FINISHED GOODS",
          Category: "KURTI",
          Subcategory: "FASHION KURTI",
          Sizes: ["M"],
          Size_Group: null,
        },
        childRows: { variants: [{ color: "BLACK", variant_code: null, sku: null, price_override: null }] },
      },
      {
        rowNumber: 4,
        code: null,
        description: null,
        fields: {
          article: "FW66",
          Brand: "LABEL",
          Product_Master: "FINISHED GOODS",
          Category: "KURTI",
          Subcategory: "FASHION KURTI",
          Sizes: ["S"],
          Size_Group: null,
        },
        childRows: { variants: [{ color: "GREY", variant_code: null, sku: null, price_override: null }] },
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].rowNumber).toBe(2);
    expect(result[0].fields.Sizes).toEqual(["S", "M"]);
    expect(result[0].fields.Size_Group).toBe("S,M");
    expect(result[0].childRows.variants).toEqual([
      { color: "BLACK", variant_code: null, sku: null, price_override: null },
      { color: "GREY", variant_code: null, sku: null, price_override: null },
    ]);
  });

  it("rejects conflicting shared fields rather than partially importing a style", () => {
    const row = {
      rowNumber: 2,
      code: null,
      description: null,
      fields: { article: "FW66", Brand: "LABEL", Category: "KURTI", Sizes: ["S"] },
      childRows: { variants: [{ color: "BLACK" }] },
    };

    expect(() => groupArticleMatrixRows([
      row,
      { ...row, rowNumber: 3, fields: { ...row.fields, Category: "TOPS", Sizes: ["M"] } },
    ])).toThrow(/conflicting Category values in spreadsheet rows 2, 3/);
  });

  it("rejects conflicting values for a repeated color variant", () => {
    const row = {
      rowNumber: 2,
      code: null,
      description: null,
      fields: { article: "FW66", Sizes: ["S"] },
      childRows: { variants: [{ color: "BLACK", sku: "A" }] },
    };

    expect(() => groupArticleMatrixRows([
      row,
      { ...row, rowNumber: 3, fields: { ...row.fields, Sizes: ["M"] }, childRows: { variants: [{ color: "BLACK", sku: "B" }] } },
    ])).toThrow(/color "BLACK" has conflicting sku values/);
  });
});
