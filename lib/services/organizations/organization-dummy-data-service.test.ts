import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, transactionMock, permissionMock, orderNumberMock } = vi.hoisted(() => {
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
    masterUom: delegate(),
    finishedGoodsSizeWise: delegate(),
    billOfMaterialItem: delegate(),
    merchandisingOrder: delegate(),
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
    orderNumberMock: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: permissionMock,
}));
vi.mock("@/lib/services/orders/order-service", () => ({
  reserveNextOrderNumber: orderNumberMock,
}));
vi.mock("@/lib/services/platform/segment-form-restriction-service", () => ({
  getEffectiveSegmentFormRestriction: vi.fn().mockResolvedValue(null),
  validateMonthlyFormLimits: vi.fn().mockResolvedValue(undefined),
  validateRestrictedFormFields: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/platform/order-quantity-limit-service", () => ({
  lockOrganizationOrderQuantityLimit: vi.fn().mockResolvedValue(undefined),
}));

import {
  createOrganizationDummyData,
  deleteOrganizationDummyData,
  getOrganizationDummyDataStatus,
} from "./organization-dummy-data-service";

const organization = {
  id: "internal-org-id",
  organization_name: "Northwind Apparel",
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  prismaMock.organization.findFirst.mockResolvedValue(organization);
  permissionMock.mockResolvedValue({ organization_id: organization.id });
  let nextOrderNumber = 1;
  orderNumberMock.mockImplementation(async () => `ORD-${String(nextOrderNumber++).padStart(4, "0")}`);
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
  transactionMock.masterRawMaterial.createManyAndReturn.mockImplementation(
    (args: { data: Array<{ raw_material_name: string }> }) => Promise.resolve(args.data.map((item, index) => ({
      id: `raw-material-demo-${index}`,
      raw_material_name: item.raw_material_name,
    }))),
  );
  transactionMock.merchandisingOrder.create.mockImplementation(
    (args: { data: { orderNo: string } }) => Promise.resolve({ id: `demo-order-${args.data.orderNo}`, orderNo: args.data.orderNo }),
  );
});

describe("organization dummy data service", () => {
  it("creates a batch of sample masters before its draft order and reuses organization baseline masters", async () => {
    await expect(createOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ created: true, orderNo: "ORD-0001", orderCount: 10 });

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
    const orderRows = transactionMock.merchandisingOrder.create.mock.calls.map((call) => call[0].data);
    expect(orderRows).toHaveLength(10);
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
    const finishedGoodsCalls = transactionMock.finishedGoodsSizeWise.createMany.mock.calls;
    expect(finishedGoodsCalls).toHaveLength(10);
    expect(finishedGoodsCalls.reduce((total, call) => total + call[0].data.reduce((orderTotal: number, row: { beforeExcessQty: number }) => orderTotal + row.beforeExcessQty, 0), 0)).toBe(27500);
    const bomCalls = transactionMock.billOfMaterialItem.createMany.mock.calls;
    expect(bomCalls).toHaveLength(10);
    bomCalls.forEach((call) => {
      expect(call[0].data.length).toBeGreaterThanOrEqual(30);
      expect(call[0].data.length).toBeLessThanOrEqual(35);
      expect(new Set(call[0].data.map((row: { rawMaterialName: string }) => row.rawMaterialName)).size).toBe(call[0].data.length);
    });
    expect(bomCalls[0][0].data[0]).toEqual(expect.objectContaining({
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
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids).toHaveLength(145);
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids)
      .toContainEqual({ datasetVersion: "apparel-10-orders-2026-09" });
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids
      .filter((record: { moduleKey?: string }) => record.moduleKey === "sample-order"))
      .toHaveLength(10);
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
    expect(transactionMock.merchandisingOrder.create).not.toHaveBeenCalled();
  });

  it("replaces a legacy active batch only after its sample order passes dependency checks", async () => {
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
    expect(transactionMock.merchandisingOrder.create).toHaveBeenCalledTimes(10);
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
        { moduleKey: "raw-material", id: "raw-material-demo-id" },
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
    const dependencyCountFields = transactionMock.merchandisingOrder.findFirst.mock.calls[0][0].select._count.select;
    expect(dependencyCountFields).not.toHaveProperty("finishedGoods");
    expect(dependencyCountFields).not.toHaveProperty("bomItems");
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
    expect(transactionMock.masterEntity.deleteMany).not.toHaveBeenCalled();
    expect(transactionMock.masterProduct.deleteMany).not.toHaveBeenCalled();
    expect(transactionMock.organizationDummyDataBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "EMPTY", sample_order_id: null, master_record_ids: Prisma.JsonNull },
    }));
  });

  it("blocks cleanup when the sample order has downstream records", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      sample_order_id: "demo-order-id",
      master_record_ids: [],
    });
    transactionMock.merchandisingOrder.findFirst.mockResolvedValue({
      _count: {
        workOrders: 1,
        finishedGoods: 0,
        bomItems: 0,
        outgoingShares: 0,
        acceptedShares: 0,
        groupedPurchaseOrderLines: 0,
      },
    });

    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .rejects.toThrow("A sample order is already used by production, inventory, procurement, or sharing records.");

    expect(transactionMock.merchandisingOrder.deleteMany).not.toHaveBeenCalled();
    expect(transactionMock.masterCategory.deleteMany).not.toHaveBeenCalled();
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
