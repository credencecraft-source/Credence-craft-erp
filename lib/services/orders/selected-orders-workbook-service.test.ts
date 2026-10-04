import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import XlsxPopulate from "xlsx-populate";

const { getOrderById, getMasterValuesForOrganization, getSizeGroupSizesForOrganization } = vi.hoisted(() => ({
  getOrderById: vi.fn(),
  getMasterValuesForOrganization: vi.fn(),
  getSizeGroupSizesForOrganization: vi.fn(),
}));

vi.mock("@/lib/services/orders/order-service", () => ({ getOrderById }));
vi.mock("@/lib/master-data/master-data-constants", () => ({
  getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization,
}));

import { createSelectedOrdersWorkbook } from "./selected-orders-workbook-service";

function makeOrder(id: string, sizeGroup = "Standard") {
  return {
    id,
    organization_id: "organization-id",
    entity_id: "entity-id",
    orderNo: `ORD-${id}`,
    entityName: "Factory",
    category: "Apparel",
    subCategory: "Shirts",
    season: "Winter",
    article: "STYLE-1",
    styleName: `Style ${id}`,
    colors: "Navy",
    buyer: "Buyer",
    brand: "Brand",
    sizeGroup,
    haveSizeRatio: false,
    ratioOrderQty: null,
    orderQty: 100,
    deliveryDate: null,
    finalStatus: "Draft",
    processStatus: null,
    sourceStatus: null,
    process_template_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    finishedGoods: [],
    bomItems: [{
      id: `bom-${id}`,
      categoryType: "Fabric",
      category: "Main Fabric",
      subCategory: "Woven",
      rawMaterialName: "Cotton",
      stockUom: "Meters",
      size: "M",
      orderQty: 100,
      buyerConsumption: 1.2,
      buyerPrice: 5,
      internalConsumption: 1.1,
      internalPrice: 4,
      valuePerGarmentRm: 0,
      consumption: 0,
      requiredQty: 0,
      itemWiseExcessPercentage: 2,
      itemWiseExcessQty: 0,
      totalRequiredQty: 0,
    }],
    processTemplate: null,
    processSteps: [],
  };
}

describe("createSelectedOrdersWorkbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrderById.mockImplementation(async (id: string) => makeOrder(id));
    getMasterValuesForOrganization.mockImplementation(async (_organizationId: string, key: string) => {
      if (key === "size-group") return [{ id: "group-id", value_id: "group-value", label: "Standard" }];
      return [{ id: `${key}-id`, value_id: `${key}-value`, label: `${key} master` }];
    });
    getSizeGroupSizesForOrganization.mockResolvedValue([
      { groupId: "group-id", size: { id: "size-id", value_id: "size-value", label: "S", is_active: true } },
      { groupId: "group-id", size: { id: "size-id-2", value_id: "size-value-2", label: "M", is_active: true } },
    ]);
  });

  it("creates editable size quantities and a separate blank BOM sheet per order", async () => {
    const buffer = await createSelectedOrdersWorkbook("organization-id", ["order-1", "order-2"]);
    const workbook = await XlsxPopulate.fromDataAsync(buffer);
    const parsedWorkbook = XLSX.read(buffer, { type: "buffer" });
    const archive = await JSZip.loadAsync(buffer);
    const zip = await JSZip.loadAsync(buffer);
    const finishedGoodsXml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

    expect(parsedWorkbook.SheetNames).toEqual([
      "Finished Goods",
      "BOM 1-ORD-order-1",
      "BOM 2-ORD-order-2",
      "Masters",
    ]);
    expect(finishedGoodsXml).not.toContain("<sheetProtection");
    for (const path of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]) {
      const xml = await archive.file(path)!.async("string");
      expect(xml).not.toContain("<sheetProtection");
    }
    expect(parsedWorkbook.Sheets["Finished Goods"]?.["!protect"]).toBeUndefined();
    expect(workbook.sheet("Finished Goods").range("A2:F2").value()).toEqual([["ORD-order-1", "Style order-1", "Shirts", "Standard", undefined, undefined]]);
    const bomSheet = workbook.sheet("BOM 1-ORD-order-1");
    expect(bomSheet.cell("A2").value()).toBe("ORD-order-1");
    expect(bomSheet.cell("B2").value()).toBe("Style order-1");
    expect(bomSheet.cell("C2").value()).toBe("Shirts");
    expect(bomSheet.cell("D2").value()).toBeUndefined();
    expect(bomSheet.cell("G2").value()).toBeUndefined();
    expect(bomSheet.cell("J2").value()).toBeUndefined();
    expect(bomSheet.range("D2:D11").dataValidation()).toMatchObject({
      type: "list",
      formula1: "BomRawMaterialTypes",
    });

    workbook.sheet("Finished Goods").cell("E2").value(42);
    const editedWorkbookBytes = await workbook.outputAsync({ type: "nodebuffer" });
    const reopenedWorkbook = await XlsxPopulate.fromDataAsync(editedWorkbookBytes);
    expect(reopenedWorkbook.sheet("Finished Goods").cell("E2").value()).toBe(42);
    const reopenedSheetJsWorkbook = XLSX.read(editedWorkbookBytes, { type: "buffer" });
    expect(reopenedSheetJsWorkbook.Sheets["Finished Goods"]?.E2?.v).toBe(42);

    expect(getOrderById).toHaveBeenNthCalledWith(1, "order-1", "organization-id");
    expect(getOrderById).toHaveBeenNthCalledWith(2, "order-2", "organization-id");
  });

  it("rejects selections with different size groups before creating a workbook", async () => {
    getOrderById.mockImplementation(async (id: string) => makeOrder(id, id === "order-1" ? "Standard" : "Petite"));

    await expect(createSelectedOrdersWorkbook("organization-id", ["order-1", "order-2"]))
      .rejects.toThrow("same Size Group");
  });

  it("rejects an order missing from the authorized organization", async () => {
    getOrderById.mockImplementation(async (id: string) => id === "missing" ? null : makeOrder(id));

    await expect(createSelectedOrdersWorkbook("organization-id", ["order-1", "missing"]))
      .rejects.toThrow("unavailable in this organization");
    expect(getMasterValuesForOrganization).not.toHaveBeenCalled();
  });
});
