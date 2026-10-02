import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, transactionMock, permissionMock, orderNumbersMock, monthlyFormLimitsMock, orderLimitLockMock } = vi.hoisted(() => {
  const delegate = () => ({
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: "created-id" }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    createManyAndReturn: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    upsert: vi.fn().mockResolvedValue({ id: "batch-id", status: "EMPTY" }),
  });
  const transactionMock = {
    auditEvent: delegate(),
    approvalRequest: delegate(),
    masterArticle: delegate(),
    masterBrand: delegate(),
    masterBuyer: delegate(),
    masterCategory: delegate(),
    masterColor: delegate(),
    masterCurrencyType: delegate(),
    masterEntity: delegate(),
    masterProduct: delegate(),
    masterRawMaterial: delegate(),
    masterVendor: delegate(),
    masterRawMaterialCategory: delegate(),
    masterRawMaterialSubCategory: delegate(),
    masterRawMaterialType: delegate(),
    masterSeason: delegate(),
    masterSize: delegate(),
    masterSizeGroup: delegate(),
    masterSizeGroupSize: delegate(),
    masterSubCategory: delegate(),
    masterStockUomConvert: delegate(),
    masterUom: delegate(),
    factoryDailyProductionReportLine: delegate(),
    factoryGrn: delegate(),
    factoryWorkOrder: delegate(),
    workOrderProcessController: delegate(),
    finishedGoodsSizeWise: delegate(),
    billOfMaterialItem: delegate(),
    groupedPurchaseOrder: delegate(),
    masterPurchaseOrder: delegate(),
    merchandisingOrder: delegate(),
    masterPurchaseOrderLine: delegate(),
    masterPurchaseOrderSource: delegate(),
    purchaseOrder: delegate(),
    procurementDocumentCounter: delegate(),
    organizationDummyDataBatch: delegate(),
  };
  const prismaMock = {
    $transaction: vi.fn(),
    organization: { findFirst: vi.fn() },
    organizationDummyDataBatch: { findUnique: vi.fn() },
  };
  return {
    prismaMock,
    transactionMock,
    permissionMock: vi.fn(),
    orderNumbersMock: vi.fn(),
    monthlyFormLimitsMock: vi.fn().mockResolvedValue(undefined),
    orderLimitLockMock: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: permissionMock,
}));
vi.mock("@/lib/services/orders/order-service", () => ({
  reserveNextOrderNumbers: orderNumbersMock,
}));
vi.mock("@/lib/services/platform/segment-form-restriction-service", () => ({
  getEffectiveSegmentFormRestriction: vi.fn().mockResolvedValue(null),
  validateMonthlyFormLimits: monthlyFormLimitsMock,
  validateRestrictedFormFields: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/platform/order-quantity-limit-service", () => ({
  lockOrganizationOrderQuantityLimit: orderLimitLockMock,
}));

import {
  createOrganizationDummyData,
  createOrganizationDummyDataForNewOrganization,
  deleteOrganizationDummyData,
  getOrganizationDummyDataStatus,
} from "./organization-dummy-data-service";

const organization = {
  id: "internal-org-id",
  organization_name: "Northwind Apparel",
  approval_status: "APPROVED",
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  prismaMock.organization.findFirst.mockResolvedValue(organization);
  permissionMock.mockResolvedValue({ organization_id: organization.id, role: "OWNER" });
  orderNumbersMock.mockResolvedValue(Array.from({ length: 10 }, (_, index) => `ORD-${String(index + 1).padStart(4, "0")}`));
  transactionMock.organizationDummyDataBatch.upsert.mockResolvedValue({ id: "batch-id", status: "EMPTY" });
  transactionMock.masterEntity.findFirst.mockResolvedValue({ id: "org-entity-id" });
  transactionMock.masterProduct.findFirst.mockResolvedValue({ id: "finished-goods-id" });
  transactionMock.masterRawMaterialType.findFirst.mockResolvedValue({ id: "raw-material-type-id" });
  transactionMock.masterCategory.createManyAndReturn.mockResolvedValue([
    { id: "category-shirt-id", category_name: "Shirt" },
    { id: "category-pant-id", category_name: "Pant" },
    { id: "category-shorts-id", category_name: "Shorts" },
    { id: "category-jacket-id", category_name: "Jacket" },
  ]);
  transactionMock.masterSubCategory.createManyAndReturn.mockResolvedValue(Array.from({ length: 10 }, (_, index) => ({ id: `subcategory-demo-${index}` })));
  transactionMock.masterBrand.createManyAndReturn.mockResolvedValue([
    "Blackberrys", "Andamen", "Peter England", "Benetton", "Bombay Shirt Company",
    "Rare Rabbit", "Turtle", "Allen Solly", "Louis Philippe", "Van Heusen",
  ].map((brand, index) => ({ id: `brand-demo-${index}`, brand })));
  transactionMock.masterVendor.createManyAndReturn.mockResolvedValue([
    "ARAVIND FABRICS", "VARDHAMAN", "RAYMONDS", "UNITED PLASTIC", "GIRIRAG PACKAGING", "CORD THREAD",
  ].map((vendor, index) => ({ id: `vendor-demo-${index}`, vendor })));
  transactionMock.masterCurrencyType.createManyAndReturn.mockResolvedValue([
    { id: "currency-inr-id", currency_type: "INR" },
    { id: "currency-dollar-id", currency_type: "Dollar" },
  ]);
  transactionMock.masterBuyer.createManyAndReturn.mockResolvedValue(Array.from({ length: 3 }, (_, index) => ({ id: `buyer-demo-${index}` })));
  transactionMock.masterSeason.create.mockResolvedValue({ id: "season-demo-id" });
  transactionMock.masterArticle.createManyAndReturn.mockImplementation(
    (args: { data: Array<{ article: string }> }) => Promise.resolve(args.data.map((item, index) => ({
      id: `article-demo-${index}`,
      article: item.article,
    }))),
  );
  transactionMock.masterColor.createManyAndReturn.mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({ id: `color-demo-${index}` })));
  transactionMock.masterSize.createManyAndReturn.mockResolvedValue([
    "S", "M", "L", "XL", "XXL", "XXXL", "32", "34", "36", "38", "40",
  ].map((size, index) => ({ id: `size-demo-${index}`, size })));
  transactionMock.masterSizeGroup.createManyAndReturn.mockResolvedValue([
    { id: "size-group-shirt-id", size_group: "SHIRT" },
    { id: "size-group-pant-id", size_group: "PANT" },
  ]);
  transactionMock.masterRawMaterialCategory.createManyAndReturn.mockResolvedValue([
    { id: "raw-category-fabric-id", raw_material_category: "FABRIC AND INTERLINNG" },
    { id: "raw-category-sewing-id", raw_material_category: "SEWING TRIMS" },
    { id: "raw-category-packing-id", raw_material_category: "PACKING TRIMS" },
    { id: "raw-category-service-id", raw_material_category: "SERVICE" },
  ]);
  transactionMock.masterRawMaterialSubCategory.createManyAndReturn.mockImplementation(
    (args: { data: Array<{ raw_material_sub_category: string }> }) => Promise.resolve(args.data.map((item, index) => ({
      id: `raw-subcategory-demo-${index}`,
      raw_material_sub_category: item.raw_material_sub_category,
    }))),
  );
  transactionMock.masterUom.createManyAndReturn.mockResolvedValue([
    { id: "uom-mtr-id", uom: "MTR" },
    { id: "uom-pcs-id", uom: "PCS" },
    { id: "uom-kg-id", uom: "KG" },
  ]);
  transactionMock.masterStockUomConvert.createManyAndReturn.mockResolvedValue([
    { id: "uom-convert-mtr-id" },
    { id: "uom-convert-pcs-id", name: "PCS", stock_uom_id: "uom-pcs-id", how_many: "1" },
    { id: "uom-convert-kg-id", name: "KG", stock_uom_id: "uom-kg-id", how_many: "1" },
    { id: "uom-convert-box-id" },
    { id: "uom-convert-cone-id" },
  ]);
  transactionMock.masterRawMaterial.createManyAndReturn.mockImplementation(
    (args: { data: Array<{ raw_material_name: string }> }) => Promise.resolve(args.data.map((item, index) => ({
      id: `raw-material-demo-${index}`,
      raw_material_name: item.raw_material_name,
    }))),
  );
  transactionMock.billOfMaterialItem.createManyAndReturn.mockImplementation(
    (args: { data: Array<Record<string, unknown>> }) => Promise.resolve(args.data.map((item, index) => ({
      id: `bom-demo-${index}`,
      ...item,
    }))),
  );
  transactionMock.groupedPurchaseOrder.create.mockImplementation(
    (args: { data: { lines: { create: unknown[] } } }) => Promise.resolve({
      id: `grouped-po-demo-${transactionMock.groupedPurchaseOrder.create.mock.calls.length}`,
      lines: args.data.lines.create.map((_, index) => ({ id: `grouped-line-demo-${index}` })),
    }),
  );
  transactionMock.merchandisingOrder.createManyAndReturn.mockImplementation(
    (args: { data: Array<{ orderNo: string }> }) => Promise.resolve(args.data.map((item) => ({ id: `demo-order-${item.orderNo}`, orderNo: item.orderNo }))),
  );
});

describe("organization dummy data service", () => {
  it("creates sample purchase orders with pending approval requests and reuses baseline masters", async () => {
    transactionMock.masterPurchaseOrder.findMany.mockResolvedValue([{
      id: "master-po-demo-id",
      vendor_id: "vendor-demo-0",
      entity_id: "org-entity-id",
      raw_material: "MAIN FABRIC",
      category: "FABRIC AND INTERLINNG",
      sub_category: "MAIN FABRIC",
      lines: [{ id: "master-po-line-demo-id", grouped_qty: "360", vendor_price: 85, total_spend: 30600 }],
      sourceRecords: [{ groupedPurchaseOrder: { gst: 5, hsn_code: "5208" } }],
    }]);
    transactionMock.purchaseOrder.create.mockResolvedValue({ id: "created-id", purchase_order_no: "PO-DEMO-0001" });

    await expect(createOrganizationDummyData("user-id", "public-org-id", "Sample Operator"))
      .resolves.toEqual({ created: true, orderNo: "ORD-0001", orderCount: 10 });

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 20000, timeout: 150000 });
    expect(permissionMock).toHaveBeenCalledWith("user-id", "public-org-id", "ORGANIZATION_SETTINGS");
    expect(transactionMock.masterEntity.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: organization.id, entity_name: organization.organization_name, is_active: true },
    }));
    expect(transactionMock.masterProduct.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: organization.id, product_master_name: "Finished Goods", is_active: true },
    }));
    expect(transactionMock.masterEntity.create).not.toHaveBeenCalled();
    expect(transactionMock.masterProduct.create).not.toHaveBeenCalled();
    expect(transactionMock.masterCategory.createManyAndReturn.mock.calls[0][0].data.map((item: { category_name: string }) => item.category_name))
      .toEqual(["Shirt", "Pant", "Shorts", "Jacket"]);
    expect(transactionMock.masterSubCategory.createManyAndReturn.mock.calls[0][0].data).toEqual(expect.arrayContaining([
      expect.objectContaining({ category_id: "category-shirt-id", sub_category: "Full Sleeve Shirt" }),
      expect.objectContaining({ category_id: "category-pant-id", sub_category: "Formal Trouser" }),
      expect.objectContaining({ category_id: "category-shorts-id", sub_category: "Denim Shorts" }),
      expect.objectContaining({ category_id: "category-jacket-id", sub_category: "Bomber Jacket" }),
    ]));
    expect(transactionMock.masterBrand.createManyAndReturn.mock.calls[0][0].data).toHaveLength(10);
    expect(transactionMock.masterBuyer.createManyAndReturn.mock.calls[0][0].data).toEqual(expect.arrayContaining([
      expect.objectContaining({ buyer_name: "Impulse", currency_type_id: "currency-inr-id" }),
      expect.objectContaining({ buyer_name: "Benetton", currency_type_id: "currency-dollar-id" }),
    ]));
    expect(transactionMock.masterColor.createManyAndReturn.mock.calls[0][0].data).toHaveLength(12);
    expect(transactionMock.masterSize.createManyAndReturn.mock.calls[0][0].data).toHaveLength(11);
    expect(transactionMock.masterSizeGroup.createManyAndReturn.mock.calls[0][0].data.map((item: { size_group: string }) => item.size_group))
      .toEqual(["SHIRT", "PANT"]);
    expect(transactionMock.masterRawMaterialCategory.createManyAndReturn.mock.calls[0][0].data.map((item: { raw_material_category: string }) => item.raw_material_category))
      .toEqual(["FABRIC AND INTERLINNG", "SEWING TRIMS", "PACKING TRIMS", "SERVICE"]);
    expect(transactionMock.masterRawMaterialSubCategory.createManyAndReturn.mock.calls[0][0].data.map((item: { raw_material_sub_category: string }) => item.raw_material_sub_category))
      .toEqual([
        "MAIN FABRIC", "INTERLINING", "MAIN LABEL", "SIZE LABEL", "WASHCARE LABEL", "TAPE", "BUTTON", "SEWINGTHREAD", "EMB THREAD",
        "HANG TAG", "U CLIP", "M CLIP", "COLLAR TRAVELLER", "COLLAR PATTI", "COLLAR BONE", "BACK SUPPORT", "BUTTER FLY",
        "TISSUE PAPER", "POLY BAG", "WRAPPING POLY ROLL", "BARCODE", "CARTON", "SERVICE",
      ]);
    expect(transactionMock.masterUom.createManyAndReturn.mock.calls[0][0].data.map((item: { uom: string }) => item.uom))
      .toEqual(["MTR", "PCS", "KG"]);
    expect(transactionMock.masterStockUomConvert.createManyAndReturn.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ organization_id: organization.id, stock_uom_id: "uom-mtr-id", name: "MTR", how_many: "1" }),
      expect.objectContaining({ organization_id: organization.id, stock_uom_id: "uom-pcs-id", name: "PCS", how_many: "1" }),
      expect.objectContaining({ organization_id: organization.id, stock_uom_id: "uom-kg-id", name: "KG", how_many: "1" }),
      expect.objectContaining({ organization_id: organization.id, stock_uom_id: "uom-mtr-id", name: "BOX", how_many: "10000" }),
      expect.objectContaining({ organization_id: organization.id, stock_uom_id: "uom-mtr-id", name: "CONE", how_many: "1000" }),
    ]);
    const rawMaterialRows = transactionMock.masterRawMaterial.createManyAndReturn.mock.calls[0][0].data;
    expect(rawMaterialRows).toHaveLength(39);
    expect(rawMaterialRows.map((item: { raw_material_name: string }) => item.raw_material_name)).toEqual([
      "MAIN FABRIC -AW24ANDMSYD059 KG 3395",
      "INTERLINING - 3630 - CHARCOAL",
      "INTERLINING - 3610 - CHARCOAL",
      "ANDM - MAIN LABEL - NAVY",
      "SIZE CUM FIT LABEL -NAVY (SLIM) - S",
      "SIZE CUM FIT LABEL -NAVY (SLIM) - M",
      "SIZE CUM FIT LABEL -NAVY (SLIM) - L",
      "SIZE CUM FIT LABEL -NAVY (SLIM) - XL",
      "SIZE CUM FIT LABEL -NAVY (SLIM) - XXL",
      "ANDM - WASH CARE -: 100% COTTON",
      "BLACK SATIN TAPE",
      "SS23ANDBTN004 BUTTON - 18L",
      "SS23ANDBTN004 BUTTON - 14L",
      "LABEL ATTACHING THREAD SH- C7361 120 TKT",
      "SH#HV39X 120 TKT EPIC",
      "BUTTON ATTACHMENT SH#HV39X 120 TKT EPIC",
      "SH#C0898 180TKT EPIC",
      "SH#C8834 180TKT EPIC",
      "SH#C7927 180TKT EPIC",
      "SH#C7988 180TKT EPIC",
      "ANDM - HANG TAG",
      "METAL CLIP",
      "PLASTIC CLIP",
      "COLLAR TRAVELLER",
      "COLLAR PATTI",
      "PVC COLLAR BONE - L5CM X W1.2CM (MILKY WHITE)",
      "BACK SUPPORT",
      "BUTTER FLY",
      "TISSUE PAPER",
      "1.5\" & 2\"",
      "POLY BAG 10.5\"W X 15\"L + 1\"G + 3\"FLAP",
      "POLY WRAP FILM",
      "BARCODE PRICE STICKER - S",
      "BARCODE PRICE STICKER - M",
      "BARCODE PRICE STICKER - L",
      "BARCODE PRICE STICKER - XL",
      "BARCODE PRICE STICKER - XXL",
      "Outer carton in cms - 5ply w-40 , l-60.5, h-40",
      "Transport charge",
    ]);
    expect(rawMaterialRows[0]).toEqual(expect.objectContaining({
      raw_material_category_id: "raw-category-fabric-id",
      raw_material_sub_category_id: "raw-subcategory-demo-0",
      stock_uom_id: "uom-mtr-id",
      raw_material_type_id: "raw-material-type-id",
    }));
    expect(rawMaterialRows[31]).toEqual(expect.objectContaining({
      raw_material_category_id: "raw-category-packing-id",
      raw_material_sub_category_id: "raw-subcategory-demo-19",
      stock_uom_id: "uom-kg-id",
    }));
    expect(rawMaterialRows[38]).toEqual(expect.objectContaining({
      raw_material_category_id: "raw-category-service-id",
      raw_material_sub_category_id: "raw-subcategory-demo-22",
      stock_uom_id: "uom-pcs-id",
    }));
    expect(transactionMock.masterSizeGroupSize.createMany.mock.calls[0][0].data).toHaveLength(11);
    expect(orderNumbersMock).toHaveBeenCalledWith(organization.id, 10, transactionMock);
    expect(orderLimitLockMock).toHaveBeenCalledWith(transactionMock, organization.id);
    expect(monthlyFormLimitsMock).toHaveBeenCalledTimes(1);
    expect(monthlyFormLimitsMock).toHaveBeenCalledWith(
      organization.id,
      "merchandising_orders",
      4020,
      undefined,
      transactionMock,
      null,
      10,
    );
    const orderRows: Array<{
      entity_id: string;
      orderQty: number;
      article: string;
      category: string;
      subCategory: string;
      colors: string;
      sourceStatus: string;
      finalStatus: string;
    }> = transactionMock.merchandisingOrder.createManyAndReturn.mock.calls[0][0].data;
    expect(orderRows).toHaveLength(10);
    expect(orderRows.every((order) => order.entity_id === "org-entity-id")).toBe(true);
    expect(Math.max(...orderRows.map((order) => order.orderQty))).toBeLessThanOrEqual(4000);
    expect(orderRows.map((order) => order.orderQty)).toEqual([360, 420, 390, 410, 450, 480, 350, 400, 430, 330]);
    expect(orderRows.reduce((total, order) => total + order.orderQty, 0)).toBe(4020);
    expect(new Set(orderRows.map((order) => order.article)).size).toBe(10);
    expect(orderRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "Shirt", subCategory: "Full Sleeve Shirt", colors: "Black", sourceStatus: "DEMO", finalStatus: "Draft" }),
      expect.objectContaining({ category: "Pant", subCategory: "Formal Trouser", colors: "Grey" }),
      expect.objectContaining({ category: "Shorts", subCategory: "Cargo Shorts", colors: "Green" }),
      expect.objectContaining({ category: "Jacket", subCategory: "Bomber Jacket", colors: "Maroon" }),
    ]));
    const finishedGoodsRows: Array<{ beforeExcessQty: number }> = transactionMock.finishedGoodsSizeWise.createMany.mock.calls[0][0].data;
    expect(finishedGoodsRows).toHaveLength(55);
    expect(finishedGoodsRows.reduce((total, row) => total + row.beforeExcessQty, 0)).toBe(27500);
    const bomRows = transactionMock.billOfMaterialItem.createManyAndReturn.mock.calls[0][0].data;
    const bomRowsByOrder = new Map<string, Array<{ rawMaterialName: string }>>();
    for (const row of bomRows) {
      const orderRowsForOrder = bomRowsByOrder.get(row.order_id) ?? [];
      orderRowsForOrder.push(row);
      bomRowsByOrder.set(row.order_id, orderRowsForOrder);
    }
    expect(bomRowsByOrder.size).toBe(10);
    for (const orderBomRows of bomRowsByOrder.values()) {
      expect(orderBomRows.length).toBeGreaterThanOrEqual(30);
      expect(orderBomRows.length).toBeLessThanOrEqual(35);
      expect(new Set(orderBomRows.map((row) => row.rawMaterialName)).size).toBe(orderBomRows.length);
      expect(orderBomRows.map((row) => row.rawMaterialName)).toContain("MAIN FABRIC -AW24ANDMSYD059 KG 3395");
    }
    const sharedMaterialOrderCount = new Map<string, Set<string>>();
    for (const row of bomRows) {
      const orderIds = sharedMaterialOrderCount.get(row.rawMaterialName) ?? new Set<string>();
      orderIds.add(row.order_id);
      sharedMaterialOrderCount.set(row.rawMaterialName, orderIds);
    }
    expect([...sharedMaterialOrderCount.values()].some((orderIds) => orderIds.size > 1)).toBe(true);
    expect(transactionMock.groupedPurchaseOrder.create).toHaveBeenCalled();
    const groupedPurchaseOrderCalls = transactionMock.groupedPurchaseOrder.create.mock.calls as Array<[{ data: { status: string; vendor_id: string; vendor_price: number; gst: number; hsn_code: string; buying_uom: string; lines: { create: unknown[] } } }] >;
    expect(groupedPurchaseOrderCalls.length).toBeGreaterThan(0);
    expect(groupedPurchaseOrderCalls.every((call) =>
      call[0].data.status === "PRICE_APPROVED"
      && Boolean(call[0].data.vendor_id)
      && Number(call[0].data.vendor_price) > 0
      && Number(call[0].data.gst) > 0
      && Boolean(call[0].data.hsn_code)
      && Boolean(call[0].data.buying_uom)
    )).toBe(true);
    expect(groupedPurchaseOrderCalls.some((call) => call[0].data.lines.create.length > 1)).toBe(true);
    const masterPurchaseOrderCalls = transactionMock.masterPurchaseOrder.create.mock.calls as Array<[{ data: { status: string; vendor_id: string; sourceRecords: { create: { grouped_purchase_order_id: string } }; lines: { create: unknown[] } } }] >;
    expect(masterPurchaseOrderCalls.length).toBe(groupedPurchaseOrderCalls.length);
    expect(masterPurchaseOrderCalls.every((call) =>
      call[0].data.status === "MASTER_GROUPED"
      && Boolean(call[0].data.vendor_id)
      && Boolean(call[0].data.sourceRecords.create.grouped_purchase_order_id)
      && call[0].data.lines.create.length > 0,
    )).toBe(true);
    const purchaseOrderCalls = transactionMock.purchaseOrder.create.mock.calls as Array<[{ data: { status: string }; select: { id: boolean; purchase_order_no: boolean } }] >;
    expect(purchaseOrderCalls.length).toBeGreaterThan(0);
    expect(purchaseOrderCalls.every((call) => call[0].data.status === "PENDING_APPROVAL")).toBe(true);
    expect(transactionMock.approvalRequest.create).toHaveBeenCalledTimes(purchaseOrderCalls.length);
    expect(transactionMock.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: organization.id,
        module_key: "purchase-order",
        entity_type: "purchase-order",
        entity_key: "PO-DEMO-0001",
        entity_label: "PO-DEMO-0001",
        requested_by: "Sample Operator",
        status: "pending",
        entity_ref_id: "created-id",
        notes: "Purchase Order PO-DEMO-0001 is waiting for approval.",
      }),
    });
    expect(bomRows[0]).toEqual(expect.objectContaining({
      categoryType: "Item",
      requiredQty: "360",
      totalRequiredQty: "360",
    }));
    expect(transactionMock.organizationDummyDataBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "ACTIVE",
        sample_order_id: "demo-order-ORD-0001",
        master_record_ids: expect.arrayContaining([
          { moduleKey: "category", id: "category-shirt-id" },
          { moduleKey: "size-group", id: "size-group-shirt-id" },
          { moduleKey: "raw-material-category", id: "raw-category-fabric-id" },
          { moduleKey: "uom", id: "uom-mtr-id" },
        ]),
      }),
    }));
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids).toHaveLength(229);
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids)
      .toContainEqual({ datasetVersion: "apparel-10-orders-2026-09" });
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids
      .filter((record: { moduleKey?: string }) => record.moduleKey === "sample-order"))
      .toHaveLength(10);
  });

  it("allows only the pending organization's owner to seed during onboarding", async () => {
    prismaMock.organization.findFirst.mockResolvedValue(null);

    await expect(createOrganizationDummyDataForNewOrganization("user-id", "public-org-id"))
      .rejects.toThrow("This organization is not available for dummy-data setup.");

    permissionMock.mockResolvedValue({ organization_id: organization.id, role: "ADMIN" });
    prismaMock.organization.findFirst.mockResolvedValue({ ...organization, approval_status: "PENDING_APPROVAL" });
    await expect(createOrganizationDummyDataForNewOrganization("user-id", "public-org-id"))
      .rejects.toThrow("Only the organization owner can prepare sample data before approval.");

    permissionMock.mockResolvedValue({ organization_id: organization.id, role: "OWNER" });
    await expect(createOrganizationDummyDataForNewOrganization("user-id", "public-org-id"))
      .resolves.toMatchObject({ created: true, orderCount: 10 });
    expect(prismaMock.organization.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ approval_status: "PENDING_APPROVAL" }),
    }));
  });

  it("keeps regular dummy-data setup unavailable until approval", async () => {
    prismaMock.organization.findFirst.mockResolvedValue(null);

    await expect(createOrganizationDummyData("user-id", "public-org-id"))
      .rejects.toThrow("This organization is not available for dummy-data setup.");
    expect(prismaMock.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ approval_status: "APPROVED" }),
    }));
  });

  it("does not create a second batch when dummy data is already active", async () => {
    const currentVersion = [
      { datasetVersion: "apparel-10-orders-2026-09" },
      ...Array.from({ length: 10 }, (_, index) => ({ moduleKey: "sample-order", id: `sample-order-${index}` })),
    ];
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({ status: "ACTIVE", master_record_ids: currentVersion });
    transactionMock.organizationDummyDataBatch.upsert.mockResolvedValue({ id: "batch-id", status: "ACTIVE", master_record_ids: currentVersion });

    await expect(createOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ created: false, orderNo: null, orderCount: 10 });

    expect(transactionMock.masterCategory.create).not.toHaveBeenCalled();
    expect(transactionMock.merchandisingOrder.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("replaces a legacy active batch through the same tracked cleanup path", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({ status: "ACTIVE", master_record_ids: [] });
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      sample_order_id: "old-demo-order-id",
      master_record_ids: [{ moduleKey: "category", id: "old-category-id" }],
    });
    transactionMock.merchandisingOrder.findFirst.mockResolvedValueOnce({
      _count: {
        workOrders: 0,
        finishedGoods: 0,
        bomItems: 0,
        outgoingShares: 0,
        acceptedShares: 0,
        groupedPurchaseOrderLines: 0,
      },
    }).mockResolvedValueOnce(null);

    await expect(createOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ created: true, orderNo: "ORD-0001", orderCount: 10 });

    expect(transactionMock.merchandisingOrder.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["old-demo-order-id"] }, organization_id: organization.id },
    });
    expect(transactionMock.masterCategory.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["old-category-id"] } },
    });
    expect(transactionMock.merchandisingOrder.createManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it("deletes batch-owned Finished Goods and BOM rows while preserving baseline masters", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      sample_order_id: "demo-order-id",
      master_record_ids: [
        { moduleKey: "category", id: "category-demo-id" },
        { moduleKey: "sub-category", id: "subcategory-demo-id" },
        { moduleKey: "brand", id: "brand-demo-id" },
        { moduleKey: "buyer", id: "buyer-demo-id" },
        { moduleKey: "season", id: "season-demo-id" },
        { moduleKey: "article", id: "article-demo-id" },
        { moduleKey: "color", id: "color-demo-id" },
        { moduleKey: "size", id: "size-demo-id" },
        { moduleKey: "size-group", id: "size-group-demo-id" },
        { moduleKey: "raw-material-category", id: "raw-category-demo-id" },
        { moduleKey: "raw-material-sub-category", id: "raw-subcategory-demo-id" },
        { moduleKey: "currency-type", id: "currency-demo-id" },
        { moduleKey: "uom", id: "uom-demo-id" },
        { moduleKey: "stock-uom-convert", id: "uom-convert-demo-id" },
        { moduleKey: "raw-material", id: "raw-material-demo-id" },
        { moduleKey: "purchase-order", id: "demo-purchase-order-id" },
        { moduleKey: "sample-order", id: "demo-order-id" },
        ...Array.from({ length: 9 }, (_, index) => ({ moduleKey: "sample-order", id: `demo-order-${index + 2}` })),
      ],
    });
    transactionMock.merchandisingOrder.findFirst.mockImplementation(async (args: { where: { id?: unknown } }) =>
      typeof args.where.id === "string"
        ? { _count: { workOrders: 0, outgoingShares: 0, acceptedShares: 0, groupedPurchaseOrderLines: 0 } }
        : null,
    );

    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ deleted: true });

    expect(transactionMock.merchandisingOrder.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["demo-order-id", ...Array.from({ length: 9 }, (_, index) => `demo-order-${index + 2}`)] },
        organization_id: organization.id,
      },
    });
    expect(transactionMock.masterCategory.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["category-demo-id"] } },
    });
    expect(transactionMock.masterRawMaterialSubCategory.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["raw-subcategory-demo-id"] } },
    });
    expect(transactionMock.masterRawMaterial.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["raw-material-demo-id"] } },
    });
    expect(transactionMock.masterRawMaterialCategory.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["raw-category-demo-id"] } },
    });
    expect(transactionMock.masterCurrencyType.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["currency-demo-id"] } },
    });
    expect(transactionMock.masterUom.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["uom-demo-id"] } },
    });
    expect(transactionMock.approvalRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: organization.id,
        entity_type: "purchase-order",
        entity_ref_id: { in: ["demo-purchase-order-id"] },
      },
    });
    expect(transactionMock.masterStockUomConvert.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["uom-convert-demo-id"] } },
    });
    expect(transactionMock.masterEntity.deleteMany).not.toHaveBeenCalled();
    expect(transactionMock.masterProduct.deleteMany).not.toHaveBeenCalled();
    expect(transactionMock.organizationDummyDataBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "EMPTY", sample_order_id: null, master_record_ids: Prisma.JsonNull },
    }));
  });

  it("deletes sample-linked production records without dependency checks", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      sample_order_id: "demo-order-id",
      master_record_ids: [],
    });
    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ deleted: true });

    const sampleWorkOrderWhere = {
      workOrder: { organization_id: organization.id, order_id: { in: ["demo-order-id"] } },
    };
    expect(transactionMock.factoryDailyProductionReportLine.deleteMany).toHaveBeenCalledWith({ where: sampleWorkOrderWhere });
    expect(transactionMock.factoryGrn.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, ...sampleWorkOrderWhere },
    });
    expect(transactionMock.workOrderProcessController.deleteMany).toHaveBeenCalledWith({ where: sampleWorkOrderWhere });
    expect(transactionMock.factoryWorkOrder.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, order_id: { in: ["demo-order-id"] } },
    });
    expect(transactionMock.merchandisingOrder.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["demo-order-id"] }, organization_id: organization.id },
    });
  });

  it("deletes sample purchase orders before removing vendor masters still tied to grouped orders", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      sample_order_id: "demo-order-id",
      master_record_ids: [{ moduleKey: "vendor", id: "vendor-demo-id" }],
    });
    transactionMock.groupedPurchaseOrder.findMany.mockResolvedValue([{ id: "grouped-po-demo-id" }]);
    transactionMock.masterPurchaseOrder.findMany.mockResolvedValue([{ id: "master-po-demo-id" }]);

    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ deleted: true });

    expect(transactionMock.groupedPurchaseOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { vendor_id: { in: ["vendor-demo-id"] } },
        ]),
      }),
    }));
    expect(transactionMock.purchaseOrder.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { vendor_id: { in: ["vendor-demo-id"] } },
        ]),
      }),
    }));
    expect(transactionMock.masterVendor.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["vendor-demo-id"] } },
    });
  });

  it("shows migration-not-ready status when the batch table has not been deployed", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "The table `public.organization_dummy_data_batches` does not exist in the current database.",
      { code: "P2021", clientVersion: "test", meta: { table: "public.organization_dummy_data_batches" } },
    ));

    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toEqual({ status: "SCHEMA_NOT_READY", createdAt: null, orderNo: null, masterCount: 0 });
  });
});
