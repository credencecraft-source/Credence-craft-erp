import { describe, expect, it } from "vitest";
import XlsxPopulate from "xlsx-populate";
import * as XLSX from "xlsx";
import { parseBulkOrderFile } from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/order-management/merchandising/bulk-order-creation/_page-content/bulk-order-template";
import { createBulkOrderTemplate } from "./bulk-order-template-service";

describe("createBulkOrderTemplate", () => {
  it("creates one clean Orders sheet with organization dropdowns and a validated delivery date", async () => {
    const template = await createBulkOrderTemplate({
      entity: [{ id: "entity-1", value_id: "entity-value-1", label: "Factory One" }],
      article: [{ id: "article-1", value_id: "article-value-1", label: "STYLE-101" }],
      "size-group": [{ id: "group-1", value_id: "group-value-1", label: "Standard" }],
      color: [
        { id: "color-1", value_id: "color-value-1", label: "Navy" },
        { id: "color-2", value_id: "color-value-2", label: "Ivory" },
      ],
      buyer: [{ id: "buyer-1", value_id: "buyer-value-1", label: "Buyer A" }],
    });
    const workbook = await XlsxPopulate.fromDataAsync(template);
    const ordersSheet = workbook.sheet("Orders");
    const mastersSheet = workbook.sheet("Masters");
    const parsedWorkbook = XLSX.read(template, { type: "buffer", cellDates: true });

    expect(parsedWorkbook.SheetNames).toEqual(["Orders", "Masters"]);
    expect(ordersSheet.range("A2:A501").dataValidation()).toMatchObject({
      type: "list",
      showErrorMessage: "true",
      formula1: "OrderEntityNames",
    });
    expect(ordersSheet.range("G2:G501").dataValidation()).toMatchObject({
      type: "list",
      showErrorMessage: "false",
      formula1: "OrderColors",
    });
    expect(ordersSheet.range("J2:J501").dataValidation()).toMatchObject({
      type: "list",
      showErrorMessage: "true",
      formula1: "OrderSizeGroups",
    });
    expect(ordersSheet.range("K2:K501").dataValidation()).toMatchObject({
      type: "date",
      operator: "between",
      formula1: 1,
      formula2: 2958465,
      promptTitle: "Delivery Date",
    });
    expect(ordersSheet.cell("K2").style("numberFormat")).toBe("yyyy-mm-dd");
    expect(parsedWorkbook.Sheets.Orders?.A2).toBeUndefined();
    expect(mastersSheet.cell("F2").value()).toBe("Navy");
    expect(mastersSheet.cell("F3").value()).toBe("Ivory");
    expect(mastersSheet.hidden()).toBe(true);
    expect(workbook.definedName("OrderColors")).toBeTruthy();
  });

  it("round-trips a clean single-sheet order into the existing standard order input", async () => {
    const template = await createBulkOrderTemplate({
      entity: [{ id: "entity-1", value_id: "entity-value-1", label: "Factory One" }],
      category: [{ id: "category-1", value_id: "category-value-1", label: "Apparel" }],
      "sub-category": [{ id: "subcategory-1", value_id: "subcategory-value-1", label: "Shirts" }],
      season: [{ id: "season-1", value_id: "season-value-1", label: "Winter 2026" }],
      article: [{ id: "article-1", value_id: "article-value-1", label: "STYLE-101" }],
      "size-group": [{ id: "group-1", value_id: "group-value-1", label: "Standard" }],
      size: [{ id: "size-1", value_id: "size-value-1", label: "Small" }],
      color: [{ id: "color-1", value_id: "color-value-1", label: "Navy" }],
      buyer: [{ id: "buyer-1", value_id: "buyer-value-1", label: "Buyer A" }],
      brand: [{ id: "brand-1", value_id: "brand-value-1", label: "Brand A" }],
    });
    const workbook = await XlsxPopulate.fromDataAsync(template);
    workbook.sheet("Orders").range("A2:K2").value([[
      "Factory One",
      "Apparel",
      "Shirts",
      "Winter 2026",
      "STYLE-101",
      "Oxford Shirt",
      "Navy",
      "Buyer A",
      "Brand A",
      "Standard",
      "2026-12-15",
    ]]);

    const contents = await workbook.outputAsync({ type: "nodebuffer" });
    const fileContents = new ArrayBuffer(contents.byteLength);
    new Uint8Array(fileContents).set(contents);
    const [parsed] = await parseBulkOrderFile(new File([fileContents], "orders.xlsx"));

    expect(parsed).toMatchObject({
      spreadsheetRow: 2,
      errors: [],
      order: {
        article: "STYLE-101",
        orderQty: null,
        deliveryDate: "2026-12-15",
        bomRows: [],
      },
    });
    expect(parsed.order?.rows).toBeUndefined();
  });
});
