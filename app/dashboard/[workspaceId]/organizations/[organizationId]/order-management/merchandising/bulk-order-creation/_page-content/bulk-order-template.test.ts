import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  BULK_ORDER_COLUMNS,
  findMissingOrderMasters,
  normalizeOrderMasterValues,
  parseBulkOrderFile,
  parseBulkOrderRows,
  parseBulkOrderWorkbook,
} from "./bulk-order-template";

const validOrder = [
  "Main Factory",
  "Apparel",
  "Shirts",
  "Winter 2026",
  "ART-100",
  "Oxford Shirt",
  "Blue",
  "Buyer One",
  "Brand One",
  "Standard",
  "2026-12-15",
];
const legacyColumns = [
  ...BULK_ORDER_COLUMNS.slice(0, 10),
  "Finished Goods BOM",
  "Quantity",
  "Delivery Date",
];
const legacyOrder = [
  ...validOrder.slice(0, 10),
  "S:10; M:20",
  30,
  "2026-12-15",
];

describe("bulk order template parser", () => {
  it("maps an order without Finished Goods BOM or quantity details", () => {
    const [parsed] = parseBulkOrderRows([[...BULK_ORDER_COLUMNS], validOrder]);

    expect(parsed).toEqual({
      spreadsheetRow: 2,
      errors: [],
      order: {
        entityName: "Main Factory",
        category: "Apparel",
        subCategory: "Shirts",
        season: "Winter 2026",
        article: "ART-100",
        styleName: "Oxford Shirt",
        colors: "Blue",
        buyer: "Buyer One",
        brand: "Brand One",
        sizeGroup: "Standard",
        orderQty: null,
        deliveryDate: "2026-12-15",
        bomRows: [],
      },
    });
    expect(parsed.order?.rows).toBeUndefined();
  });

  it("reports row-level errors for missing fields and keeps validating legacy BOM quantity columns", () => {
    const invalidOrder = [...legacyOrder];
    invalidOrder[7] = "";
    invalidOrder[11] = 31;

    const [parsed] = parseBulkOrderRows([[...legacyColumns], invalidOrder]);

    expect(parsed.order).toBeNull();
    expect(parsed.errors).toContain("Buyer is required.");
    expect(parsed.errors).toContain("Quantity (31) must match the Finished Goods BOM total (30).");
  });

  it("rejects templates without all required columns", () => {
    expect(() => parseBulkOrderRows([[...BULK_ORDER_COLUMNS.slice(1)], validOrder.slice(1)]))
      .toThrow("Template columns are missing: Entity Name.");
  });

  it("normalizes spreadsheet dates in day-first format", () => {
    const dateOrder = [...validOrder];
    dateOrder[10] = "15/12/2026";

    const [parsed] = parseBulkOrderRows([[...BULK_ORDER_COLUMNS], dateOrder]);

    expect(parsed.order?.deliveryDate).toBe("2026-12-15");
  });

  it("accepts and parses more than 100 order rows", () => {
    const parsed = parseBulkOrderRows([
      [...BULK_ORDER_COLUMNS],
      ...Array.from({ length: 120 }, () => [...validOrder]),
    ]);

    expect(parsed).toHaveLength(120);
    expect(parsed.every((row) => row.order !== null)).toBe(true);
  });

  it("reads an uploaded Excel workbook through the file parser", async () => {
    const workbook = XLSX.utils.book_new();
    const excelOrder: Array<string | number | Date> = [...validOrder];
    excelOrder[10] = new Date(Date.UTC(2026, 11, 15));
    const worksheet = XLSX.utils.aoa_to_sheet([[...BULK_ORDER_COLUMNS], excelOrder]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    const contents = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([contents], "orders.xlsx");

    const [parsed] = await parseBulkOrderFile(file);

    expect(parsed.order?.article).toBe("ART-100");
    expect(parsed.order?.deliveryDate).toBe("2026-12-15");
    expect(parsed.order?.rows).toBeUndefined();
  });

  it("does not require quantity or Finished Goods BOM columns in the downloaded template", () => {
    expect(BULK_ORDER_COLUMNS).not.toContain("Finished Goods BOM");
    expect(BULK_ORDER_COLUMNS).not.toContain("Quantity");

    const [parsed] = parseBulkOrderRows([[...BULK_ORDER_COLUMNS], validOrder]);

    expect(parsed.order).not.toBeNull();
    expect(parsed.order?.orderQty).toBeNull();
    expect(parsed.order?.rows).toBeUndefined();
  });

  it("finds unique organization master values and retains parent context for linked masters", () => {
    const [parsed] = parseBulkOrderRows([[...BULK_ORDER_COLUMNS], validOrder]);
    const missing = findMissingOrderMasters([parsed], {
      entity: [{ id: "entity-1", value_id: "entity-value-1", label: "Main Factory" }],
      category: [{ id: "category-1", value_id: "category-value-1", label: "Apparel" }],
      "sub-category": [],
      season: [{ id: "season-1", value_id: "season-value-1", label: "Winter 2026" }],
      article: [],
      color: [{ id: "color-1", value_id: "color-value-1", label: "Blue" }],
      buyer: [{ id: "buyer-1", value_id: "buyer-value-1", label: "Buyer One" }],
      brand: [],
      "size-group": [],
    });

    expect(missing).toEqual([
      { moduleKey: "sub-category", label: "Shirts", relatedLabels: { category: ["Apparel"] } },
      { moduleKey: "article", label: "ART-100", relatedLabels: {} },
      { moduleKey: "brand", label: "Brand One", relatedLabels: {} },
      { moduleKey: "size-group", label: "Standard", relatedLabels: { brand: ["Brand One"] } },
    ]);
  });

  it("checks entered master values even when another order field needs correction", () => {
    const incompleteOrder = [...validOrder];
    incompleteOrder[10] = "";
    const [parsed] = parseBulkOrderRows([[...BULK_ORDER_COLUMNS], incompleteOrder]);
    const missing = findMissingOrderMasters([parsed], {});

    expect(parsed.order).toBeNull();
    expect(missing.map(({ moduleKey, label }) => [moduleKey, label])).toContainEqual(["article", "ART-100"]);
  });

  it("normalizes case-insensitive matches to the organization's canonical master labels", () => {
    const lowerCaseOrder = [...validOrder];
    lowerCaseOrder[0] = "main factory";
    lowerCaseOrder[6] = "blue";
    const parsedRows = parseBulkOrderRows([[...BULK_ORDER_COLUMNS], lowerCaseOrder]);
    const [normalized] = normalizeOrderMasterValues(parsedRows, {
      entity: [{ id: "entity-1", value_id: "entity-value-1", label: "Main Factory" }],
      color: [{ id: "color-1", value_id: "color-value-1", label: "Blue" }],
    });

    expect(normalized.order?.entityName).toBe("Main Factory");
    expect(normalized.order?.colors).toBe("Blue");
  });

  it("combines the Orders, Finished Goods, and BOM sheets and ignores the example row", () => {
    const parsedRows = parseBulkOrderWorkbook(
      [
        ["Example Row", "Entity Name", "Product Category", "Product Sub Category", "Season", "Article", "Style Name", "Colors", "Buyer", "Brand", "Size Group", "Delivery Date"],
        ["EXAMPLE - DELETE BEFORE IMPORT", "", "", "", "", "", "", "", "", "", "", ""],
        ["", "Main Factory", "Apparel", "Shirts", "Winter 2026", "ART-100", "Oxford Shirt", "Blue", "Buyer One", "Brand One", "Standard", "2026-12-15"],
      ],
      [
        ["Style Number", "Size Group", "Size", "Quantity", "Excess %", "Orders Row"],
        ["example", "example", "M", 10, 2, 2],
        ["ART-100", "Standard", "S", 10, 5, 3],
        ["ART-100", "Standard", "M", 20, 0, 3],
        ["ART-100", "Standard", "", "", "", 3],
      ],
      [
        ["Orders Row", "RM Category Type", "BOM Category", "BOM Sub Category", "Raw Material", "Stock UOM", "Size", "Buyer Consumption", "Buyer Price", "Internal Consumption", "Internal Price", "Itemwise Excess %"],
        [2, "", "", "", "Example Material", "", "", "", "", "", "", ""],
        [3, "Fabric", "Main Fabric", "Cotton", "Cotton Fabric", "MTR", "All Sizes", 1.2, 2, 1.1, 1.5, 5],
      ],
    );

    expect(parsedRows).toHaveLength(1);
    expect(parsedRows[0]).toMatchObject({
      spreadsheetRow: 3,
      errors: [],
      order: {
        article: "ART-100",
        orderQty: 30,
        rows: [
          { size: "S", beforeExcessQty: 10, excess: 5 },
          { size: "M", beforeExcessQty: 20, excess: 0 },
        ],
        bomRows: [{
          categoryType: "Fabric",
          rawMaterialName: "Cotton Fabric",
          internalConsumption: 1.1,
          itemWiseExcessPercentage: 5,
        }],
      },
    });
  });

});
