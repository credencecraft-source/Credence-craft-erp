import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, transactionMock, permissionMock, orderNumbersMock, groupedPurchaseOrderMock, masterPurchaseOrderMock, stockBookingsMock, generatePurchaseOrdersMock, submitPurchaseOrderMock, createSampleGateEntriesMock, createSampleGrnsMock, verifySampleGrnsMock, allocateSampleGrnsMock, createSampleWorkOrdersMock, monthlyFormLimitsMock, orderLimitLockMock } = vi.hoisted(() => {
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
    rawMaterialStock: delegate(),
    rawMaterialStockBooking: delegate(),
    generalPurchaseOrderRequest: delegate(),
    masterProduct: delegate(),
    masterProcess: delegate(),
    masterProcessTemplate: delegate(),
    masterProcessTemplateStep: delegate(),
    masterOperationTemplate: delegate(),
    masterOperationTemplateStep: delegate(),
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
    groupedPurchaseOrderLine: delegate(),
    masterPurchaseOrder: delegate(),
    merchandisingOrder: delegate(),
    masterPurchaseOrderLine: delegate(),
    masterPurchaseOrderSource: delegate(),
    purchaseOrder: delegate(),
    gateEntry: delegate(),
    inventoryReceipt: delegate(),
    masterLocation: delegate(),
    procurementDocumentCounter: delegate(),
    organizationDummyDataBatch: delegate(),
  };
  const prismaMock = {
    $transaction: vi.fn(),
    organization: { findFirst: vi.fn() },
    organizationDummyDataBatch: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    groupedPurchaseOrder: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    merchandisingOrder: { findFirst: vi.fn(), findMany: vi.fn() },
    masterVendor: { findFirst: vi.fn(), findMany: vi.fn() },
    rawMaterialStock: { findMany: vi.fn() },
    rawMaterialStockBooking: { findMany: vi.fn() },
    masterStockUomConvert: { findMany: vi.fn().mockResolvedValue([]) },
    billOfMaterialItem: { findMany: vi.fn() },
    masterPurchaseOrder: { findFirst: vi.fn() },
    purchaseOrder: { findFirst: vi.fn(), findMany: vi.fn() },
    gateEntry: { findMany: vi.fn() },
    inventoryReceipt: { findMany: vi.fn() },
    masterLocation: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    factoryWorkOrder: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    prismaMock,
    transactionMock,
    permissionMock: vi.fn(),
    orderNumbersMock: vi.fn(),
    groupedPurchaseOrderMock: vi.fn(),
    masterPurchaseOrderMock: vi.fn(),
    stockBookingsMock: vi.fn(),
    generatePurchaseOrdersMock: vi.fn(),
    submitPurchaseOrderMock: vi.fn(),
    createSampleGateEntriesMock: vi.fn(),
    createSampleGrnsMock: vi.fn(),
    verifySampleGrnsMock: vi.fn(),
    allocateSampleGrnsMock: vi.fn(),
    createSampleWorkOrdersMock: vi.fn(),
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
vi.mock("@/lib/services/orders/grouped-purchase-order-service", () => ({
  createGroupedPurchaseOrder: groupedPurchaseOrderMock,
}));
vi.mock("@/lib/services/orders/master-purchase-order-service", () => ({
  createMasterPurchaseOrder: masterPurchaseOrderMock,
}));
vi.mock("@/lib/services/inventory/rm-stock-booking-service", () => ({
  createRawMaterialStockBookings: stockBookingsMock,
}));
vi.mock("@/lib/services/orders/purchase-order-service", () => ({
  generatePurchaseOrders: generatePurchaseOrdersMock,
  submitPurchaseOrderForApproval: submitPurchaseOrderMock,
}));
vi.mock("@/lib/services/inventory/dummy-sample-gate-entry-service", () => ({
  createDummySampleGateEntries: createSampleGateEntriesMock,
}));
vi.mock("@/lib/services/inventory/dummy-sample-grn-service", () => ({
  createDummySampleGrns: createSampleGrnsMock,
}));
vi.mock("@/lib/services/inventory/dummy-sample-verification-service", () => ({
  verifyDummySampleGrns: verifySampleGrnsMock,
}));
vi.mock("@/lib/services/inventory/dummy-sample-allocation-service", () => ({
  allocateDummySampleGrnsTopDown: allocateSampleGrnsMock,
}));
vi.mock("@/lib/services/factory/work-order-service", () => ({
  createWorkOrdersForSampleOrders: createSampleWorkOrdersMock,
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
  approveSampleGroupedPurchaseOrder,
  advanceOrganizationDummyData,
  createOrganizationDummyData,
  createOrganizationDummyDataForNewOrganization,
  deleteOrganizationDummyData,
  getDummyDataWorkflowSummary,
  getOrganizationDummyDataStatus,
  startOrganizationDummyDataAfterApproval,
  startDummyDataWizardStep,
} from "./organization-dummy-data-service";

const organization = {
  id: "internal-org-id",
  organization_name: "Northwind Apparel",
  approval_status: "APPROVED",
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.rawMaterialStockBooking.findMany.mockResolvedValue([]);
  transactionMock.groupedPurchaseOrder.findMany.mockResolvedValue([]);
  transactionMock.masterPurchaseOrder.findMany.mockResolvedValue([]);
  prismaMock.organization.findFirst.mockResolvedValue(organization);
  prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue(null);
  prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue([]);
  prismaMock.merchandisingOrder.findFirst.mockResolvedValue(null);
  prismaMock.merchandisingOrder.findMany.mockResolvedValue([]);
  prismaMock.masterVendor.findMany.mockResolvedValue([]);
  prismaMock.masterVendor.findFirst.mockResolvedValue(null);
  prismaMock.rawMaterialStock.findMany.mockResolvedValue([]);
  prismaMock.rawMaterialStockBooking.findMany.mockResolvedValue([]);
  prismaMock.masterStockUomConvert.findMany.mockResolvedValue([]);
  prismaMock.billOfMaterialItem.findMany.mockResolvedValue([]);
  prismaMock.masterPurchaseOrder.findFirst.mockResolvedValue(null);
  prismaMock.purchaseOrder.findFirst.mockResolvedValue(null);
  prismaMock.purchaseOrder.findMany.mockResolvedValue([]);
  prismaMock.gateEntry.findMany.mockResolvedValue([]);
  prismaMock.inventoryReceipt.findMany.mockResolvedValue([]);
  prismaMock.factoryWorkOrder.findMany.mockResolvedValue([]);
  prismaMock.masterLocation.findFirst.mockResolvedValue({ id: "location-demo" });
  prismaMock.masterLocation.count.mockResolvedValue(0);
  prismaMock.masterLocation.create.mockResolvedValue({ id: "location-demo-created" });
  permissionMock.mockResolvedValue({ organization_id: organization.id, role: "OWNER" });
  orderNumbersMock.mockResolvedValue(Array.from({ length: 10 }, (_, index) => `ORD-${String(index + 1).padStart(4, "0")}`));
  groupedPurchaseOrderMock.mockImplementation(async () => ({ id: `grouped-demo-${groupedPurchaseOrderMock.mock.calls.length}` }));
  masterPurchaseOrderMock.mockImplementation(async () => ({ id: `master-demo-${masterPurchaseOrderMock.mock.calls.length}` }));
  stockBookingsMock.mockImplementation(async () => ({
    id: `booking-demo-${stockBookingsMock.mock.calls.length}`,
    groupedPurchaseOrderId: `stock-grouped-demo-${stockBookingsMock.mock.calls.length}`,
    bookedLines: 1,
  }));
  generatePurchaseOrdersMock.mockImplementation(async () => ({
    id: `purchase-order-demo-${generatePurchaseOrdersMock.mock.calls.length}`,
    status: "DRAFT",
  }));
  submitPurchaseOrderMock.mockResolvedValue(undefined);
  createSampleGateEntriesMock.mockResolvedValue(
    Array.from({ length: 5 }, (_, index) => ({ id: `gate-entry-${index + 1}`, purchaseOrderId: `po-${index + 1}` })),
  );
  createSampleGrnsMock.mockResolvedValue(
    Array.from({ length: 5 }, (_, index) => ({ id: `receipt-${index + 1}`, purchaseOrderId: `po-${index + 1}` })),
  );
  verifySampleGrnsMock.mockResolvedValue({
    completedLineCount: 12,
    totalLineCount: 12,
    receiptIds: Array.from({ length: 5 }, (_, index) => `receipt-${index + 1}`),
  });
  allocateSampleGrnsMock.mockResolvedValue({ completedCount: 15, totalCount: 15 });
  createSampleWorkOrdersMock.mockResolvedValue(
    Array.from({ length: 5 }, (_, index) => ({
      id: `sample-work-order-${index + 1}`,
      orderId: `sample-order-${index + 1}`,
      orderNo: `ORD-${index + 1}`,
      workOrderNo: `WO-${index + 1}`,
      created: true,
    })),
  );
  prismaMock.groupedPurchaseOrder.findFirst.mockResolvedValue(null);
  transactionMock.organizationDummyDataBatch.update.mockResolvedValue({});
  transactionMock.organizationDummyDataBatch.upsert.mockResolvedValue({ id: "batch-id", status: "EMPTY" });
  transactionMock.masterEntity.findFirst.mockResolvedValue({ id: "org-entity-id" });
  transactionMock.masterLocation.findFirst.mockResolvedValue({ id: "active-location-id" });
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
  transactionMock.masterVendor.createManyAndReturn.mockImplementation(
    (args: { data: Array<{ vendor: string }> }) => Promise.resolve(args.data.map((item, index) => ({
      id: `vendor-demo-${index}`,
      vendor: item.vendor,
    }))),
  );
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
  transactionMock.rawMaterialStock.createManyAndReturn.mockImplementation(
    (args: { data: Array<{ raw_material: string }> }) => Promise.resolve(args.data.map((_, index) => ({
      id: `raw-material-stock-demo-${index}`,
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
  transactionMock.masterProcess.create.mockImplementation(
    (args: { data: { process_name: string } }) => Promise.resolve({ id: `process-${args.data.process_name}` }),
  );
  transactionMock.masterOperationTemplate.create.mockImplementation(
    (args: { data: { operation_template_name: string } }) => Promise.resolve({ id: `operation-template-${args.data.operation_template_name}` }),
  );
  transactionMock.masterProcessTemplate.create.mockResolvedValue({ id: "sample-process-template-id" });
});

describe("organization dummy data service", () => {
  it("maps staged workflow states to the approval lifecycle", () => {
    expect(getDummyDataWorkflowSummary("AWAITING_GROUPED_APPROVAL", "GROUPED_APPROVAL")).toMatchObject({
      title: "Grouped approval pending",
      isPaused: true,
      detail: "Waiting for every sample grouped purchase order to receive price approval before creating master groups.",
    });
    expect(getDummyDataWorkflowSummary("AWAITING_PO_APPROVAL", "PO_APPROVAL")).toMatchObject({
      title: "Purchase order approval pending",
      isPaused: true,
      detail: "Waiting for all sample purchase orders to be approved before receipts can be generated.",
    });
    expect(getDummyDataWorkflowSummary("ACTIVE", "COMPLETE")).toMatchObject({
      title: "Create sample work orders",
      isPaused: false,
    });
    expect(getDummyDataWorkflowSummary("ACTIVE", "COMPLETE", true)).toMatchObject({
      title: "Setup complete",
      isPaused: false,
    });
  });

  it("creates sample master data, orders, and BOM before procurement starts", async () => {
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
      .resolves.toMatchObject({
        created: true,
        orderNo: "ORD-0001",
        orderCount: 10,
        status: "IN_PROGRESS",
        stage: "CREATE_GROUPS",
      });

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 20000, timeout: 150000 });
    expect(permissionMock).toHaveBeenCalledWith("user-id", "public-org-id", "ORGANIZATION_SETTINGS");
    expect(transactionMock.masterEntity.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: organization.id, entity_name: organization.organization_name, is_active: true },
    }));
    expect(transactionMock.masterProduct.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: organization.id, product_master_name: "Finished Goods", is_active: true },
    }));
    const sampleOrderRows = transactionMock.merchandisingOrder.createManyAndReturn.mock.calls[0][0].data;
    expect(sampleOrderRows).toHaveLength(10);
    expect(sampleOrderRows.every((order: { process_template_id: string }) => order.process_template_id === "sample-process-template-id")).toBe(true);
    expect(transactionMock.masterProcessTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: organization.id,
        process_name: "No Embroidery Only Wash",
        legacy_metadata: {
          first_process_id: "process-Cutting",
          last_process_id: "process-Iron",
        },
      }),
    }));
    expect(transactionMock.masterEntity.create).not.toHaveBeenCalled();
    expect(transactionMock.masterProduct.create).not.toHaveBeenCalled();
    expect(groupedPurchaseOrderMock).not.toHaveBeenCalled();
    expect(transactionMock.purchaseOrder.create).not.toHaveBeenCalled();
    expect(transactionMock.masterCategory.createManyAndReturn.mock.calls[0][0].data.map((item: { category_name: string }) => item.category_name))
      .toEqual(["Shirt", "Pant", "Shorts", "Jacket"]);
    expect(transactionMock.masterSubCategory.createManyAndReturn.mock.calls[0][0].data).toEqual(expect.arrayContaining([
      expect.objectContaining({ category_id: "category-shirt-id", sub_category: "Full Sleeve Shirt" }),
      expect.objectContaining({ category_id: "category-pant-id", sub_category: "Formal Trouser" }),
      expect.objectContaining({ category_id: "category-shorts-id", sub_category: "Denim Shorts" }),
      expect.objectContaining({ category_id: "category-jacket-id", sub_category: "Bomber Jacket" }),
    ]));
    expect(transactionMock.masterBrand.createManyAndReturn.mock.calls[0][0].data).toHaveLength(10);
    const sampleVendorRows = transactionMock.masterVendor.createManyAndReturn.mock.calls[0][0].data;
    expect(sampleVendorRows).toHaveLength(11);
    expect(sampleVendorRows.filter((vendor: { is_current_store: boolean }) => vendor.is_current_store))
      .toEqual([expect.objectContaining({
        organization_id: organization.id,
        vendor: `${organization.organization_name} - Current Store`,
        is_current_store: true,
        is_active: true,
      })]);
    expect(sampleVendorRows.slice(0, 10).every((vendor: { is_current_store: boolean }) => !vendor.is_current_store)).toBe(true);
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
    const sampleStockRows = transactionMock.rawMaterialStock.createManyAndReturn.mock.calls[0][0].data;
    expect(sampleStockRows).toHaveLength(38);
    expect(sampleStockRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        organization_id: organization.id,
        entity_id: "org-entity-id",
        location_id: "active-location-id",
        raw_material: "MAIN FABRIC -AW24ANDMSYD059 KG 3395",
        quantity_on_hand: new Prisma.Decimal(250),
        source_type: "MANUAL",
      }),
      expect.objectContaining({
        raw_material: "POLY WRAP FILM",
        quantity_on_hand: new Prisma.Decimal(80),
      }),
    ]));
    expect(sampleStockRows.some((row: { raw_material: string }) => row.raw_material === "Transport charge")).toBe(false);
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
    expect(groupedPurchaseOrderMock).not.toHaveBeenCalled();
    expect(transactionMock.groupedPurchaseOrder.create).not.toHaveBeenCalled();
    expect(transactionMock.masterPurchaseOrder.create).not.toHaveBeenCalled();
    expect(transactionMock.purchaseOrder.create).not.toHaveBeenCalled();
    expect(transactionMock.approvalRequest.create).not.toHaveBeenCalled();
    expect(bomRows[0]).toEqual(expect.objectContaining({
      categoryType: "Item",
      requiredQty: "360",
      totalRequiredQty: "360",
    }));
    expect(transactionMock.organizationDummyDataBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "IN_PROGRESS",
        stage: "CREATE_GROUPS",
        sample_order_id: "demo-order-ORD-0001",
        master_record_ids: expect.arrayContaining([
          { moduleKey: "category", id: "category-shirt-id" },
          { moduleKey: "size-group", id: "size-group-shirt-id" },
          { moduleKey: "raw-material-category", id: "raw-category-fabric-id" },
          { moduleKey: "uom", id: "uom-mtr-id" },
          { moduleKey: "raw-material-stock", id: "raw-material-stock-demo-0" },
        ]),
      }),
    }));
    expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "CREATE_DUMMY_DATA_STAGE",
        details: expect.objectContaining({ raw_material_stock_count: 38 }),
      }),
    }));
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids)
      .toContainEqual({ datasetVersion: "apparel-10-orders-2026-10" });
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids
      .filter((record: { moduleKey?: string }) => record.moduleKey === "sample-order"))
      .toHaveLength(10);
  });

  it("creates a removable sample location when the organization has no active inventory location", async () => {
    transactionMock.masterLocation.findFirst.mockResolvedValue(null);
    transactionMock.masterLocation.create.mockResolvedValue({ id: "sample-location-id" });

    await createOrganizationDummyData("user-id", "public-org-id", "Sample Operator");

    expect(transactionMock.masterLocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: organization.id,
        entity_id: "org-entity-id",
        location_name: "Sample Data Store - tch-id",
        is_active: true,
      }),
    }));
    expect(transactionMock.rawMaterialStock.createManyAndReturn.mock.calls[0][0].data[0])
      .toEqual(expect.objectContaining({ location_id: "sample-location-id" }));
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids)
      .toContainEqual({ moduleKey: "location", id: "sample-location-id" });
  });

  it("preserves an existing current-store vendor without creating another current store", async () => {
    transactionMock.masterVendor.findFirst.mockResolvedValue({ id: "existing-current-store-id", is_active: true });

    await createOrganizationDummyData("user-id", "public-org-id", "Sample Operator");

    const vendorRows = transactionMock.masterVendor.createManyAndReturn.mock.calls[0][0].data;
    expect(vendorRows).toHaveLength(10);
    expect(vendorRows.every((vendor: { is_current_store: boolean }) => !vendor.is_current_store)).toBe(true);
    expect(transactionMock.masterVendor.updateMany).not.toHaveBeenCalled();
    expect(transactionMock.organizationDummyDataBatch.update.mock.calls[0][0].data.master_record_ids)
      .not.toContainEqual({ moduleKey: "vendor", id: "existing-current-store-id" });
  });

  it("waits for every grouped PO price approval before creating master groups", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      master_record_ids: groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
      checkpoint: {},
    });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue([
      ...groupedIds.slice(0, 9).map((id) => ({ id, status: "PRICE_APPROVED" })),
      { id: groupedIds[9], status: "PENDING_PRICE_APPROVAL" },
    ]);

    await expect(advanceOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({
        advanced: false,
        status: "AWAITING_GROUPED_APPROVAL",
        stage: "GROUPED_APPROVAL",
        completedCount: 9,
        totalCount: 10,
      });
    expect(masterPurchaseOrderMock).not.toHaveBeenCalled();
    expect(generatePurchaseOrdersMock).not.toHaveBeenCalled();
  });

  it("creates and checkpoints ten distinct sample groups in Step 2", async () => {
    const orderIds = Array.from({ length: 10 }, (_, index) => `order-${index + 1}`);
    const vendorNames = [
      "ARAVIND FABRICS", "VARDHAMAN", "RAYMONDS", "UNITED PLASTIC", "GIRIRAG PACKAGING",
      "CORD THREAD", "DEMO VENDOR NORTH", "DEMO VENDOR SOUTH", "DEMO VENDOR EAST", "DEMO VENDOR WEST",
    ];
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_GROUPS",
      master_record_ids: [
        ...orderIds.map((id) => ({ moduleKey: "sample-order", id })),
        ...vendorNames.map((_, index) => ({ moduleKey: "vendor", id: `vendor-${index + 1}` })),
      ],
      checkpoint: {},
    });
    prismaMock.merchandisingOrder.findMany.mockResolvedValue(orderIds.map((id, index) => ({ id, orderNo: `ORD-${index + 1}` })));
    prismaMock.masterVendor.findMany.mockResolvedValue(vendorNames.map((vendor, index) => ({ id: `vendor-${index + 1}`, vendor })));
    prismaMock.billOfMaterialItem.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, index) => [
      { id: `bom-${index + 1}-a`, order_id: orderIds[index], rawMaterialName: `material-${index + 1}`, category: "FABRIC", categoryType: "Item", subCategory: `SUB-${index + 1}`, stockUom: "MTR", requiredQty: "10", totalRequiredQty: "10" },
      { id: `bom-${index + 1}-b`, order_id: orderIds[(index + 1) % 10], rawMaterialName: `material-${index + 1}`, category: "FABRIC", categoryType: "Item", subCategory: `SUB-${index + 1}`, stockUom: "MTR", requiredQty: "10", totalRequiredQty: "10" },
    ]).flat());

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 2))
      .resolves.toMatchObject({ created: true, status: "AWAITING_GROUPED_APPROVAL", stage: "GROUPED_APPROVAL", groupedPurchaseOrderCount: 10 });

    expect(groupedPurchaseOrderMock).toHaveBeenCalledTimes(10);
    const assignedVendorIds = groupedPurchaseOrderMock.mock.calls.map(([input]) => input.vendorId);
    expect(new Set(assignedVendorIds).size).toBe(10);
    expect(assignedVendorIds).not.toEqual(vendorNames.map((_, index) => `vendor-${index + 1}`));
    for (const [input] of groupedPurchaseOrderMock.mock.calls) {
      expect(input.lines).toHaveLength(2);
      expect(input.lines[0].bomItemId.replace(/-[ab]$/, "")).toBe(input.lines[1].bomItemId.replace(/-[ab]$/, ""));
    }
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "AWAITING_GROUPED_APPROVAL", stage: "GROUPED_APPROVAL" }),
    }));

    groupedPurchaseOrderMock.mock.calls.forEach(([input], index) => {
      prismaMock.groupedPurchaseOrder.findFirst.mockResolvedValueOnce({
        id: `grouped-demo-${index + 1}`,
        vendor_id: input.vendorId,
        lines: input.lines.map((line: { bomItemId: string; groupedQty: string }) => ({
          source_bom_item_id: line.bomItemId,
          grouped_qty: new Prisma.Decimal(line.groupedQty),
        })),
      });
    });
    groupedPurchaseOrderMock.mockClear();
    await expect(startDummyDataWizardStep("user-id", "public-org-id", 2))
      .resolves.toMatchObject({ status: "AWAITING_GROUPED_APPROVAL", groupedPurchaseOrderCount: 10 });
    expect(groupedPurchaseOrderMock).not.toHaveBeenCalled();
  });

  it("groups sample inventory from stock and vendors without double-sourcing BOM quantities", async () => {
    const orderIds = Array.from({ length: 10 }, (_, index) => `order-${index + 1}`);
    const vendorNames = [
      "ARAVIND FABRICS", "VARDHAMAN", "RAYMONDS", "UNITED PLASTIC", "GIRIRAG PACKAGING",
      "CORD THREAD", "DEMO VENDOR NORTH", "DEMO VENDOR SOUTH", "DEMO VENDOR EAST", "DEMO VENDOR WEST",
    ];
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_GROUPS",
      master_record_ids: [
        ...orderIds.map((id) => ({ moduleKey: "sample-order", id })),
        ...vendorNames.map((_, index) => ({ moduleKey: "vendor", id: `vendor-${index + 1}` })),
        { moduleKey: "raw-material-stock", id: "stock-material-1" },
        { moduleKey: "raw-material-stock", id: "stock-material-2" },
      ],
      checkpoint: {},
    });
    prismaMock.merchandisingOrder.findMany.mockResolvedValue(orderIds.map((id, index) => ({ id, orderNo: `ORD-${index + 1}` })));
    prismaMock.masterVendor.findMany.mockResolvedValue(vendorNames.map((vendor, index) => ({ id: `vendor-${index + 1}`, vendor })));
    prismaMock.masterVendor.findFirst.mockResolvedValue({ id: "current-store-vendor" });
    prismaMock.rawMaterialStock.findMany.mockResolvedValue([
      { id: "stock-material-1", raw_material: "material-1", quantity_on_hand: new Prisma.Decimal("4"), quantity_reserved: new Prisma.Decimal("0") },
      { id: "stock-material-2", raw_material: "material-2", quantity_on_hand: new Prisma.Decimal("4"), quantity_reserved: new Prisma.Decimal("0") },
    ]);
    prismaMock.billOfMaterialItem.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, index) => [
      { id: `bom-${index + 1}-a`, order_id: orderIds[index], rawMaterialName: `material-${index + 1}`, category: "FABRIC", categoryType: "Item", subCategory: `SUB-${index + 1}`, stockUom: "MTR", requiredQty: "10", totalRequiredQty: "10" },
      { id: `bom-${index + 1}-b`, order_id: orderIds[(index + 1) % 10], rawMaterialName: `material-${index + 1}`, category: "FABRIC", categoryType: "Item", subCategory: `SUB-${index + 1}`, stockUom: "MTR", requiredQty: "10", totalRequiredQty: "10" },
    ]).flat());

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 2))
      .resolves.toMatchObject({ groupedPurchaseOrderCount: 12, status: "AWAITING_GROUPED_APPROVAL" });

    expect(stockBookingsMock).toHaveBeenCalledTimes(2);
    expect(stockBookingsMock.mock.calls.map(([input]) => input.lines[0].bookedQuantity)).toEqual(["4", "4"]);
    expect(stockBookingsMock.mock.calls.map(([input]) => input.sampleGroupOrdinal)).toEqual([1, 3]);
    expect(groupedPurchaseOrderMock).toHaveBeenCalledTimes(10);
    expect(groupedPurchaseOrderMock.mock.calls.flatMap(([input]) => input.lines)).toContainEqual({
      bomItemId: "bom-1-a",
      groupedQty: "6",
    });
    expect(groupedPurchaseOrderMock.mock.calls.flatMap(([input]) => input.lines)).toContainEqual({
      bomItemId: "bom-2-a",
      groupedQty: "6",
    });
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        checkpoint: expect.objectContaining({
          completedGroupedPurchaseOrders: 12,
          totalGroupedPurchaseOrders: 12,
        }),
      }),
    }));
  });

  it("assigns sample terms and approves every grouped PO in Step 3 in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const groupedIds = Array.from({ length: 12 }, (_, index) => `group-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      master_record_ids: groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
      checkpoint: {},
    });
    prismaMock.groupedPurchaseOrder.findMany
      .mockResolvedValueOnce(groupedIds.map((id, index) => ({
        id,
        grouped_po_no: index < 10
          ? `GPO-batch-id-${String(index + 1).padStart(2, "0")}`
          : `GPO-batch-id-S${String(index - 9).padStart(2, "0")}`,
        source_type: index < 10 ? "VENDOR" : "STOCK",
        status: "PENDING_PRICE_APPROVAL",
        stock_uom: "MTR",
        total_grouped_qty: new Prisma.Decimal("2"),
        lines: [{ id: `line-${index + 1}`, grouped_qty: new Prisma.Decimal("2"), vendor_price: null }],
      })))
      .mockResolvedValueOnce(groupedIds.map((id) => ({ id, status: "PRICE_APPROVED" })));
    prismaMock.masterStockUomConvert.findMany.mockResolvedValue([
      { name: "MTR", how_many: new Prisma.Decimal("1"), stock_uom: { uom: "MTR" } },
      { name: "CONE", how_many: new Prisma.Decimal("1000"), stock_uom: { uom: "MTR" } },
    ]);
    await expect(startDummyDataWizardStep("user-id", "public-org-id", 3, "Sample Operator"))
      .resolves.toEqual({
        prepared: true,
        approved: true,
        status: "IN_PROGRESS",
        stage: "CREATE_MASTER_GROUPS",
        approvedCount: 12,
        totalCount: 12,
      });

    expect(transactionMock.groupedPurchaseOrderLine.updateMany).toHaveBeenCalledTimes(12);
    expect(transactionMock.groupedPurchaseOrder.updateMany).toHaveBeenCalledTimes(12);
    for (const [callIndex, [call]] of transactionMock.groupedPurchaseOrder.updateMany.mock.calls.entries()) {
      expect(call.where.status).toBe("PENDING_PRICE_APPROVAL");
      expect(call.data.vendor_price).toBeGreaterThanOrEqual(60);
      expect(call.data.vendor_price).toBeLessThanOrEqual(200);
      expect([5, 12, 18]).toContain(call.data.gst);
      expect(["5208", "5515", "6006", "9606"]).toContain(call.data.hsn_code);
      expect(["MTR", "CONE"]).toContain(call.data.buying_uom);
      expect(call.data.convert_value.toNumber()).toBe(call.data.buying_uom === "MTR" ? 1 : 1000);
      expect(call.data.status).toBe("PRICE_APPROVED");
      expect(call.data.approved_by).toBe("Sample Data Automation");
      expect(transactionMock.groupedPurchaseOrderLine.updateMany.mock.calls[callIndex][0].data.vendor_price)
        .toBe(call.data.vendor_price);
    }
    expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "SET_DUMMY_GROUPED_PURCHASE_ORDER_SAMPLE_TERMS" }),
    }));
    expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "APPROVE_DUMMY_GROUPED_PURCHASE_ORDER" }),
    }));
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "IN_PROGRESS",
        stage: "CREATE_MASTER_GROUPS",
        checkpoint: expect.objectContaining({ sampleTermsPrepared: true }),
      }),
    }));
  });

  it("approves one tracked sample grouped PO through an audited record-level action", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      master_record_ids: groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
    });
    transactionMock.groupedPurchaseOrder.findFirst.mockResolvedValue({
      id: "group-1",
      grouped_po_no: "GPO-batch-id-01",
      status: "PENDING_PRICE_APPROVAL",
      lines: [{ vendor_price: new Prisma.Decimal("85") }],
    });

    await expect(approveSampleGroupedPurchaseOrder("user-id", "public-org-id", "group-1"))
      .resolves.toEqual({ approved: true, id: "group-1" });

    expect(transactionMock.groupedPurchaseOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "group-1", organization_id: organization.id, status: "PENDING_PRICE_APPROVAL" },
      data: expect.objectContaining({ status: "PRICE_APPROVED", approved_by: "Sample Data Automation" }),
    }));
    expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "APPROVE_DUMMY_GROUPED_PURCHASE_ORDER", entity_id: "group-1" }),
    }));
  });

  it("approves a tracked sample grouped PO in a production deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      master_record_ids: Array.from({ length: 10 }, (_, index) => ({ moduleKey: "grouped-purchase-order", id: `group-${index + 1}` })),
    });

    await expect(approveSampleGroupedPurchaseOrder("user-id", "public-org-id", "group-1"))
      .resolves.toEqual({ approved: true, id: "group-1" });
    expect(transactionMock.groupedPurchaseOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "group-1", organization_id: organization.id, status: "PENDING_PRICE_APPROVAL" },
      data: expect.objectContaining({ status: "PRICE_APPROVED", approved_by: "Sample Data Automation" }),
    }));
  });

  it("creates one master group per approved sample group and stops before PO creation", async () => {
    const groupedIds = Array.from({ length: 12 }, (_, index) => `group-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      master_record_ids: groupedIds.map((id, index) => ({
        moduleKey: "grouped-purchase-order",
        id,
        ...(index >= 10 ? { sourceType: "STOCK" } : { sourceType: "VENDOR" }),
      })),
      checkpoint: {},
    });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id) => ({ id, status: "PRICE_APPROVED" })));
    prismaMock.masterPurchaseOrder.findFirst.mockResolvedValue(null);
    prismaMock.purchaseOrder.findFirst.mockResolvedValue(null);

    await expect(advanceOrganizationDummyData("user-id", "public-org-id", "Sample Operator"))
      .resolves.toEqual({ advanced: true, status: "IN_PROGRESS", stage: "CREATE_MASTER_GROUPS", completedCount: 12, totalCount: 12 });
    expect(masterPurchaseOrderMock).toHaveBeenCalledTimes(12);
    expect(prismaMock.organizationDummyDataBatch.update.mock.calls.some(([args]) =>
      args.data.master_record_ids?.some((record: { sourceType?: string }) => record.sourceType === "STOCK"),
    )).toBe(true);
    expect(generatePurchaseOrdersMock).not.toHaveBeenCalled();
    expect(submitPurchaseOrderMock).not.toHaveBeenCalled();
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "batch-id", organization_id: organization.id },
      data: expect.objectContaining({ status: "IN_PROGRESS", stage: "CREATE_MASTER_GROUPS" }),
    }));
  });

  it("creates, submits, and approves at least ten purchase orders in Step 5", async () => {
    const groupedIds = Array.from({ length: 12 }, (_, index) => `group-${index + 1}`);
    const masterIds = Array.from({ length: 12 }, (_, index) => `master-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_MASTER_GROUPS",
      master_record_ids: [
        ...groupedIds.map((id, index) => ({
          moduleKey: "grouped-purchase-order",
          id,
          sourceType: index < 10 ? "VENDOR" : "STOCK",
        })),
        ...masterIds.map((id, index) => ({
          moduleKey: "master-purchase-order",
          id,
          sourceType: index < 10 ? "VENDOR" : "STOCK",
        })),
      ],
      checkpoint: {},
    });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id) => ({ id, status: "MASTER_GROUPED" })));
    const sampleSources = [{ masterPurchaseOrder: { sourceRecords: [{
      groupedPurchaseOrder: { grouped_po_no: "GPO-batch-id-01" },
    }] } }];
    prismaMock.purchaseOrder.findMany
      .mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => ({
        id: `purchase-order-demo-${index + 1}`,
        status: "PENDING_APPROVAL",
        sources: sampleSources,
      })))
      .mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => ({
        id: `purchase-order-demo-${index + 1}`,
        status: "APPROVED",
      })));
    transactionMock.approvalRequest.findFirst.mockResolvedValue({ id: "approval-request-id" });

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 5, "Sample Operator"))
      .resolves.toEqual({ advanced: true, status: "IN_PROGRESS", stage: "CREATE_GATE_ENTRIES", completedCount: 10, totalCount: 10 });

    expect(generatePurchaseOrdersMock).toHaveBeenCalledTimes(10);
    expect(submitPurchaseOrderMock).toHaveBeenCalledTimes(10);
    expect(transactionMock.approvalRequest.updateMany).toHaveBeenCalledTimes(10);
    expect(transactionMock.purchaseOrder.updateMany).toHaveBeenCalledTimes(10);
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "batch-id", organization_id: organization.id },
      data: expect.objectContaining({ status: "IN_PROGRESS", stage: "CREATE_GATE_ENTRIES" }),
    }));
  });

  it("does not finish Step 5 while any sample PO is still awaiting approval", async () => {
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_PO_APPROVAL",
      stage: "PO_APPROVAL",
      master_record_ids: purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
      checkpoint: { purchaseOrderIds },
    });
    prismaMock.purchaseOrder.findMany.mockResolvedValue([
      ...purchaseOrderIds.slice(0, 9).map((id) => ({ id, status: "APPROVED", entity_id: "entity-1" })),
      { id: purchaseOrderIds[9], status: "PENDING_APPROVAL", entity_id: "entity-1" },
    ]);

    await expect(advanceOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ advanced: false, status: "AWAITING_PO_APPROVAL", stage: "PO_APPROVAL", completedCount: 9, totalCount: 10 });
    expect(prismaMock.organizationDummyDataBatch.update).not.toHaveBeenCalled();
  });

  it("marks Step 5 complete and waits at Step 6 without creating gate entries", async () => {
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_PO_APPROVAL",
      stage: "PO_APPROVAL",
      sample_order_id: "sample-order-1",
      master_record_ids: [
        { moduleKey: "sample-order", id: "sample-order-1" },
        ...purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
      ],
      checkpoint: { purchaseOrderIds, grnPurchaseOrderIds: [] },
    });
    prismaMock.purchaseOrder.findMany.mockResolvedValue(purchaseOrderIds.map((id) => ({
      id,
      status: "APPROVED",
      entity_id: "entity-1",
    })));

    await expect(advanceOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ advanced: true, status: "IN_PROGRESS", stage: "CREATE_GATE_ENTRIES", completedCount: 10, totalCount: 10 });
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "batch-id", organization_id: organization.id },
      data: expect.objectContaining({ status: "IN_PROGRESS", stage: "CREATE_GATE_ENTRIES" }),
    }));
  });

  it("auto-approves batch-linked POs in production for Step 5 and does not create gate entries", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_PO_APPROVAL",
      stage: "PO_APPROVAL",
      sample_order_id: "sample-order-1",
      master_record_ids: [
        { moduleKey: "sample-order", id: "sample-order-1" },
        ...purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
      ],
      checkpoint: { purchaseOrderIds, grnPurchaseOrderIds: [] },
    });
    const sampleSources = [{ masterPurchaseOrder: { sourceRecords: [{
      groupedPurchaseOrder: { grouped_po_no: "GPO-batch-id-01" },
    }] } }];
    prismaMock.purchaseOrder.findMany
      .mockResolvedValueOnce(purchaseOrderIds.map((id) => ({ id, status: "PENDING_APPROVAL", sources: sampleSources })))
      .mockResolvedValueOnce(purchaseOrderIds.map((id) => ({ id, status: "APPROVED", entity_id: "entity-1" })));
    transactionMock.approvalRequest.findFirst.mockResolvedValue({ id: "approval-request-id" });

    await expect(advanceOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ advanced: true, status: "IN_PROGRESS", stage: "CREATE_GATE_ENTRIES", completedCount: 10, totalCount: 10 });

    expect(transactionMock.approvalRequest.updateMany).toHaveBeenCalledTimes(10);
    expect(transactionMock.purchaseOrder.updateMany).toHaveBeenCalledTimes(10);
    expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "AUTO_APPROVE_DUMMY_PURCHASE_ORDER" }),
    }));
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "IN_PROGRESS", stage: "CREATE_GATE_ENTRIES" }),
    }));
  });

  it("creates five one-to-one sample RM Gate Entries in Step 6 and checkpoints progress", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    const masterIds = Array.from({ length: 10 }, (_, index) => `master-${index + 1}`);
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_GATE_ENTRIES",
      master_record_ids: [
        ...groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
        ...masterIds.map((id) => ({ moduleKey: "master-purchase-order", id })),
        ...purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
      ],
      checkpoint: {},
    });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id) => ({
      id,
      status: "MASTER_GROUPED",
    })));
    prismaMock.purchaseOrder.findMany.mockResolvedValue(purchaseOrderIds.map((id) => ({
      id,
      status: "APPROVED",
    })));

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 6))
      .resolves.toEqual({
        advanced: true,
        status: "IN_PROGRESS",
        stage: "CREATE_VERIFICATION",
        completedCount: 5,
        totalCount: 5,
      });

    expect(createSampleGateEntriesMock).toHaveBeenCalledWith(
      organization.id,
      "batch-id",
      purchaseOrderIds,
      "user-id",
    );
    expect(createSampleGrnsMock).toHaveBeenCalledWith(
      organization.id,
      purchaseOrderIds,
      "batch-id",
      "user-id",
    );
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "batch-id", organization_id: organization.id },
      data: expect.objectContaining({
        status: "IN_PROGRESS",
        stage: "CREATE_VERIFICATION",
        master_record_ids: expect.arrayContaining(
          Array.from({ length: 5 }, (_, index) => ({ moduleKey: "gate-entry", id: `gate-entry-${index + 1}` })),
        ),
        checkpoint: expect.objectContaining({
          gateEntryIds: Array.from({ length: 5 }, (_, index) => `gate-entry-${index + 1}`),
          completedGateEntries: 5,
          totalGateEntries: 5,
          grnIds: Array.from({ length: 5 }, (_, index) => `receipt-${index + 1}`),
          completedGrns: 5,
          totalGrns: 5,
        }),
      }),
    }));
  });

  it("verifies all sample GRN lines in Step 7 and advances to the allocation boundary", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    const masterIds = Array.from({ length: 10 }, (_, index) => `master-${index + 1}`);
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    const receiptIds = Array.from({ length: 5 }, (_, index) => `receipt-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_VERIFICATION",
      master_record_ids: [
        ...groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
        ...masterIds.map((id) => ({ moduleKey: "master-purchase-order", id })),
        ...purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
        ...receiptIds.map((id) => ({ moduleKey: "inventory-receipt", id })),
        ...Array.from({ length: 5 }, (_, index) => ({ moduleKey: "gate-entry", id: `gate-entry-${index + 1}` })),
      ],
      checkpoint: {},
    });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id) => ({
      id,
      status: "MASTER_GROUPED",
    })));
    prismaMock.purchaseOrder.findMany.mockResolvedValue(purchaseOrderIds.map((id) => ({
      id,
      status: "APPROVED",
    })));

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 7))
      .resolves.toEqual({
        advanced: true,
        status: "IN_PROGRESS",
        stage: "CREATE_ALLOCATION",
        completedCount: 12,
        totalCount: 12,
      });
    expect(verifySampleGrnsMock).toHaveBeenCalledWith(
      organization.id,
      "batch-id",
      purchaseOrderIds,
      receiptIds,
      "user-id",
    );
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "batch-id", organization_id: organization.id },
      data: expect.objectContaining({
        stage: "CREATE_ALLOCATION",
        checkpoint: expect.objectContaining({
          completedVerificationLines: 12,
          totalVerificationLines: 12,
        }),
      }),
    }));
  });

  it("allocates every verified sample GRN in Step 8 and completes the batch", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    const masterIds = Array.from({ length: 10 }, (_, index) => `master-${index + 1}`);
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    const receiptIds = Array.from({ length: 5 }, (_, index) => `receipt-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_ALLOCATION",
      master_record_ids: [
        ...groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
        ...masterIds.map((id) => ({ moduleKey: "master-purchase-order", id })),
        ...purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
        ...receiptIds.map((id) => ({ moduleKey: "inventory-receipt", id })),
      ],
      checkpoint: {},
    });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id) => ({
      id,
      status: "MASTER_GROUPED",
    })));
    prismaMock.purchaseOrder.findMany.mockResolvedValue(purchaseOrderIds.map((id) => ({
      id,
      status: "APPROVED",
    })));

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 8))
      .resolves.toEqual({
        advanced: true,
        status: "IN_PROGRESS",
        stage: "CREATE_WORK_ORDERS",
        completedCount: 15,
        totalCount: 15,
      });
    expect(allocateSampleGrnsMock).toHaveBeenCalledWith(
      organization.id,
      "batch-id",
      receiptIds,
      "user-id",
    );
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "batch-id", organization_id: organization.id },
      data: expect.objectContaining({
        status: "IN_PROGRESS",
        stage: "CREATE_WORK_ORDERS",
        checkpoint: expect.objectContaining({
          completedOrderAllocations: 15,
          totalOrderAllocations: 15,
        }),
      }),
    }));
  });

  it("does not start Step 8 before Step 7 has advanced the batch to allocation", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_VERIFICATION",
      master_record_ids: [],
      checkpoint: {},
    });

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 8))
      .rejects.toThrow("Complete Step 7 verification before allocating the verified sample GRNs.");
    expect(allocateSampleGrnsMock).not.toHaveBeenCalled();
  });

  it("creates and tracks five batch-owned sample work orders in Step 9", async () => {
    const sampleOrderIds = Array.from({ length: 10 }, (_, index) => `sample-order-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_WORK_ORDERS",
      master_record_ids: sampleOrderIds.map((id) => ({ moduleKey: "sample-order", id })),
      checkpoint: { completedOrderAllocations: 15, totalOrderAllocations: 15 },
    });

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 9))
      .resolves.toMatchObject({
        advanced: true,
        status: "ACTIVE",
        stage: "COMPLETE",
        completedCount: 5,
        totalCount: 5,
      });

    expect(createSampleWorkOrdersMock).toHaveBeenCalledWith(organization.id, "user-id", sampleOrderIds);
    expect(prismaMock.organizationDummyDataBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "batch-id", organization_id: organization.id },
      data: expect.objectContaining({
        status: "ACTIVE",
        stage: "COMPLETE",
        master_record_ids: expect.arrayContaining(
          Array.from({ length: 5 }, (_, index) => ({
            moduleKey: "sample-work-order",
            id: `sample-work-order-${index + 1}`,
          })),
        ),
        checkpoint: expect.objectContaining({
          workOrderIds: Array.from({ length: 5 }, (_, index) => `sample-work-order-${index + 1}`),
        }),
      }),
    }));
  });

  it("rejects Step 9 if the batch tracks fewer than five sample orders", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      stage: "COMPLETE",
      master_record_ids: Array.from({ length: 4 }, (_, index) => ({
        moduleKey: "sample-order",
        id: `sample-order-${index + 1}`,
      })),
      checkpoint: {},
    });

    await expect(startDummyDataWizardStep("user-id", "public-org-id", 9))
      .rejects.toThrow("At least five batch-owned sample orders are required for Step 9.");
    expect(createSampleWorkOrdersMock).not.toHaveBeenCalled();
  });

  it("resumes Step 9 for legacy batches already marked active and complete", async () => {
    const sampleOrderIds = Array.from({ length: 5 }, (_, index) => `sample-order-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      stage: "COMPLETE",
      master_record_ids: sampleOrderIds.map((id) => ({ moduleKey: "sample-order", id })),
      checkpoint: {},
    });

    await expect(advanceOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toMatchObject({ advanced: true, status: "ACTIVE", stage: "COMPLETE", completedCount: 5 });
    expect(createSampleWorkOrdersMock).toHaveBeenCalledWith(organization.id, "user-id", sampleOrderIds);
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
      { datasetVersion: "apparel-10-orders-2026-10" },
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
      .resolves.toMatchObject({ created: true, orderNo: "ORD-0001", orderCount: 10, status: "IN_PROGRESS", stage: "CREATE_GROUPS" });

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
    expect(transactionMock.generalPurchaseOrderRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: organization.id,
        raw_material_id: { in: ["raw-material-demo-id"] },
      },
    });
    expect(transactionMock.generalPurchaseOrderRequest.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(transactionMock.masterRawMaterial.deleteMany.mock.invocationCallOrder[0]);
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
      data: {
        status: "EMPTY",
        stage: "IDLE",
        checkpoint: {},
        last_error: null,
        sample_order_id: null,
        master_record_ids: Prisma.JsonNull,
      },
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
      master_record_ids: [
        { moduleKey: "vendor", id: "vendor-demo-id" },
        { moduleKey: "purchase-order", id: "purchase-order-demo-id" },
        { moduleKey: "gate-entry", id: "gate-entry-demo-id" },
        { moduleKey: "inventory-receipt", id: "receipt-demo-id" },
        { moduleKey: "raw-material-stock", id: "sample-stock-demo-id" },
        { moduleKey: "location", id: "sample-location-demo-id" },
      ],
    });
    transactionMock.groupedPurchaseOrder.findMany.mockResolvedValue([{ id: "grouped-po-demo-id" }]);
    transactionMock.masterPurchaseOrder.findMany.mockResolvedValue([{ id: "master-po-demo-id" }]);
    transactionMock.rawMaterialStock.findMany.mockResolvedValue([{ id: "sample-grn-stock-demo-id" }]);

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
    expect(transactionMock.gateEntry.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["gate-entry-demo-id"] } },
    });
    expect(transactionMock.inventoryReceipt.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["receipt-demo-id"] } },
    });
    expect(transactionMock.rawMaterialStock.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: organization.id,
        id: { in: ["sample-stock-demo-id", "sample-grn-stock-demo-id"] },
      },
    });
    expect(transactionMock.rawMaterialStock.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organization.id,
        receiptLine: {
          receipt: {
            organization_id: organization.id,
            id: { in: ["receipt-demo-id"] },
          },
        },
      },
      select: { id: true },
    });
    expect(transactionMock.masterLocation.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["sample-location-demo-id"] } },
    });
    expect(transactionMock.rawMaterialStock.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(transactionMock.masterRawMaterial.deleteMany.mock.invocationCallOrder[0]);
    expect(transactionMock.masterVendor.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["vendor-demo-id"] } },
    });
  });

  it("does not remove sample stock that is still referenced by a booking", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      sample_order_id: null,
      master_record_ids: [{ moduleKey: "raw-material-stock", id: "sample-stock-demo-id" }],
    });
    transactionMock.rawMaterialStockBooking.findMany.mockResolvedValue([{
      id: "booking-id",
      grouped_purchase_order_id: "unrelated-group",
      take_from_stock_id: "sample-stock-demo-id",
      booked_quantity: new Prisma.Decimal("1"),
      fulfilled_quantity: new Prisma.Decimal("0"),
      status: "BOOKED",
    }]);

    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .rejects.toThrow("Sample stock has bookings that cannot be safely reversed. Resolve those bookings before removing sample data.");
    expect(transactionMock.rawMaterialStock.deleteMany).not.toHaveBeenCalled();
  });

  it("releases sample stock reservations before deleting its stock groups", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "ACTIVE",
      sample_order_id: null,
      master_record_ids: [
        { moduleKey: "raw-material-stock", id: "sample-stock-demo-id" },
        { moduleKey: "grouped-purchase-order", id: "sample-stock-group", sourceType: "STOCK" },
        { moduleKey: "master-purchase-order", id: "sample-stock-master", sourceType: "STOCK" },
      ],
    });
    transactionMock.groupedPurchaseOrder.findMany.mockResolvedValue([{ id: "sample-stock-group" }]);
    transactionMock.masterPurchaseOrder.findMany.mockResolvedValue([{ id: "sample-stock-master" }]);
    transactionMock.rawMaterialStockBooking.findMany.mockResolvedValue([{
      id: "sample-booking",
      grouped_purchase_order_id: "sample-stock-group",
      take_from_stock_id: "sample-stock-demo-id",
      booked_quantity: new Prisma.Decimal("2"),
      fulfilled_quantity: new Prisma.Decimal("0"),
      status: "BOOKED",
    }]);

    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ deleted: true });

    expect(transactionMock.rawMaterialStock.updateMany).toHaveBeenCalledWith({
      where: {
        id: "sample-stock-demo-id",
        organization_id: organization.id,
        quantity_reserved: { gte: new Prisma.Decimal("2") },
      },
      data: { quantity_reserved: { decrement: new Prisma.Decimal("2") } },
    });
    expect(transactionMock.rawMaterialStockBooking.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["sample-booking"] } },
    });
    expect(transactionMock.rawMaterialStock.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: organization.id, id: { in: ["sample-stock-demo-id"] } },
    });
  });

  it("deletes a resumable batch waiting for grouped price approvals", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      sample_order_id: null,
      master_record_ids: [],
    });

    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .resolves.toEqual({ deleted: true });

    expect(transactionMock.organizationDummyDataBatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: "batch-id",
        organization_id: organization.id,
        status: "AWAITING_GROUPED_APPROVAL",
      },
      data: { status: "DELETING" },
    });
    expect(transactionMock.organizationDummyDataBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "EMPTY" }),
    }));
  });

  it("does not start a second deletion while cleanup is actually in progress", async () => {
    transactionMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "DELETING",
      stage: "DELETING",
      master_record_ids: [],
    });

    await expect(deleteOrganizationDummyData("user-id", "public-org-id"))
      .rejects.toThrow("Dummy-data cleanup is already in progress.");
    expect(transactionMock.organizationDummyDataBatch.updateMany).not.toHaveBeenCalled();
    expect(transactionMock.purchaseOrder.deleteMany).not.toHaveBeenCalled();
  });

  it("shows migration-not-ready status when the batch table has not been deployed", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "The table `public.organization_dummy_data_batches` does not exist in the current database.",
      { code: "P2021", clientVersion: "test", meta: { table: "public.organization_dummy_data_batches" } },
    ));

    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toEqual({ status: "SCHEMA_NOT_READY", createdAt: null, orderNo: null, masterCount: 0 });
  });

  it("keeps Step 1 available when an empty batch has a stale non-idle stage", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "EMPTY",
      stage: "CREATE_GROUPS",
      checkpoint: {},
      last_error: null,
      sample_order_id: null,
      master_record_ids: null,
      created_at: new Date("2026-10-02T00:00:00Z"),
    });

    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toMatchObject({ status: "EMPTY", completedSteps: [], currentStep: 1 });
  });

  it("does not auto-create sample data again after its batch has been deleted", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "EMPTY",
      stage: "IDLE",
      checkpoint: {},
      last_error: null,
      sample_order_id: null,
      master_record_ids: null,
      created_at: new Date("2026-10-02T00:00:00Z"),
    });

    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toMatchObject({ status: "EMPTY", stage: "IDLE", completedSteps: [], currentStep: 1 });
  });

  it("does not start sample-data creation from organization page visits", async () => {
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue(null);

    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toMatchObject({ status: "EMPTY", stage: "IDLE", completedSteps: [], currentStep: 1 });
  });

  it("does not restart sample-data creation after approval when a batch already exists", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({
      organization_id: "public-org-id",
      memberships: [{ workspace_user_id: "owner-user-id" }],
    });
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValueOnce({ id: "deleted-sample-batch" });

    await expect(startOrganizationDummyDataAfterApproval("internal-org-id"))
      .resolves.toMatchObject({ created: false });
    expect(transactionMock.organizationDummyDataBatch.upsert).not.toHaveBeenCalled();
  });

  it("reconstructs step and per-record approval progress from the persisted batch", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      sample_order_id: "sample-order-1",
      master_record_ids: [
        ...Array.from({ length: 10 }, (_, index) => ({ moduleKey: "sample-order", id: `sample-order-${index + 1}` })),
        ...groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
      ],
      checkpoint: { sampleTermsPrepared: true },
      last_error: null,
      created_at: new Date("2026-10-02T00:00:00Z"),
    });
    prismaMock.merchandisingOrder.findFirst.mockResolvedValue({ orderNo: "ORD-0001" });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id, index) => ({
      id,
      grouped_po_no: `GPO-batch-id-${String(index + 1).padStart(2, "0")}`,
      status: index === 9 ? "PENDING_PRICE_APPROVAL" : "PRICE_APPROVED",
      vendor_price: new Prisma.Decimal("85"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "5208",
      buying_uom: "MTR",
    })));

    const status = await getOrganizationDummyDataStatus("user-id", "public-org-id");
    expect(status).toMatchObject({
      status: "AWAITING_GROUPED_APPROVAL",
      orderNo: "ORD-0001",
      completedSteps: [1, 2],
      currentStep: 3,
      sampleTermsPrepared: true,
    });
    expect(status.groupedPurchaseOrders).toEqual(expect.arrayContaining([
      { id: "group-1", grouped_po_no: "GPO-batch-id-01", status: "PRICE_APPROVED", vendor_price: "85", gst: "5", hsn_code: "5208", buying_uom: "MTR" },
      { id: "group-10", grouped_po_no: "GPO-batch-id-10", status: "PENDING_PRICE_APPROVAL", vendor_price: "85", gst: "5", hsn_code: "5208", buying_uom: "MTR" },
    ]));
  });

  it("keeps Step 5 active until all ten sample Purchase Orders are approved", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    const masterIds = Array.from({ length: 10 }, (_, index) => `master-${index + 1}`);
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "PO_APPROVAL",
      sample_order_id: "sample-order-1",
      master_record_ids: [
        ...Array.from({ length: 10 }, (_, index) => ({ moduleKey: "sample-order", id: `sample-order-${index + 1}` })),
        ...groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
        ...masterIds.map((id) => ({ moduleKey: "master-purchase-order", id })),
        ...purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
      ],
      checkpoint: {},
      last_error: null,
      created_at: new Date("2026-10-02T00:00:00Z"),
    });
    prismaMock.merchandisingOrder.findFirst.mockResolvedValue({ orderNo: "ORD-0001" });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id) => ({
      id,
      grouped_po_no: `GPO-batch-id-${id}`,
      status: "PRICE_APPROVED",
      vendor_price: new Prisma.Decimal("85"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "5208",
      buying_uom: "MTR",
    })));
    prismaMock.purchaseOrder.findMany.mockResolvedValueOnce([
      ...purchaseOrderIds.slice(0, 9).map((id) => ({ id, status: "APPROVED" })),
      { id: purchaseOrderIds[9], status: "PENDING_APPROVAL" },
    ]);

    const pendingStatus = await getOrganizationDummyDataStatus("user-id", "public-org-id");
    expect(pendingStatus).toMatchObject({
      purchaseOrderCount: 10,
      purchaseOrdersApproved: false,
      completedSteps: [1, 2, 3, 4],
      currentStep: 5,
    });

    prismaMock.purchaseOrder.findMany.mockResolvedValue(
      purchaseOrderIds.map((id) => ({ id, status: "APPROVED" })),
    );
    const approvedStatus = await getOrganizationDummyDataStatus("user-id", "public-org-id");
    expect(approvedStatus).toMatchObject({
      purchaseOrderCount: 10,
      purchaseOrdersApproved: true,
      completedSteps: [1, 2, 3, 4, 5],
      currentStep: 6,
    });
  });

  it("keeps Step 6 active until five PO-linked GRNs are persisted and restores completion", async () => {
    const groupedIds = Array.from({ length: 10 }, (_, index) => `group-${index + 1}`);
    const masterIds = Array.from({ length: 10 }, (_, index) => `master-${index + 1}`);
    const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
    const gateEntryIds = Array.from({ length: 5 }, (_, index) => `gate-entry-${index + 1}`);
    const receiptIds = Array.from({ length: 5 }, (_, index) => `receipt-${index + 1}`);
    prismaMock.organizationDummyDataBatch.findUnique.mockResolvedValue({
      id: "batch-id",
      status: "IN_PROGRESS",
      stage: "CREATE_VERIFICATION",
      sample_order_id: "sample-order-1",
      master_record_ids: [
        ...Array.from({ length: 10 }, (_, index) => ({ moduleKey: "sample-order", id: `sample-order-${index + 1}` })),
        ...groupedIds.map((id) => ({ moduleKey: "grouped-purchase-order", id })),
        ...masterIds.map((id) => ({ moduleKey: "master-purchase-order", id })),
        ...purchaseOrderIds.map((id) => ({ moduleKey: "purchase-order", id })),
        ...gateEntryIds.map((id) => ({ moduleKey: "gate-entry", id })),
        ...receiptIds.map((id) => ({ moduleKey: "inventory-receipt", id })),
        ...Array.from({ length: 5 }, (_, index) => ({ moduleKey: "sample-work-order", id: `work-order-${index + 1}` })),
      ],
      checkpoint: {},
      last_error: null,
      created_at: new Date("2026-10-02T00:00:00Z"),
    });
    prismaMock.merchandisingOrder.findFirst.mockResolvedValue({ orderNo: "ORD-0001" });
    prismaMock.groupedPurchaseOrder.findMany.mockResolvedValue(groupedIds.map((id) => ({
      id,
      grouped_po_no: id,
      status: "MASTER_GROUPED",
      vendor_price: new Prisma.Decimal("85"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "5208",
      buying_uom: "MTR",
    })));
    prismaMock.purchaseOrder.findMany.mockResolvedValue(purchaseOrderIds.map((id) => ({ id, status: "APPROVED" })));
    prismaMock.gateEntry.findMany.mockResolvedValue(gateEntryIds.map((id, index) => ({
      id,
      purchase_order_id: purchaseOrderIds[index],
    })));
    const pendingStatus = await getOrganizationDummyDataStatus("user-id", "public-org-id");
    expect(pendingStatus).toMatchObject({
      gateEntryCount: 5,
      grnCount: 0,
      completedSteps: [1, 2, 3, 4, 5],
      currentStep: 6,
    });

    prismaMock.inventoryReceipt.findMany.mockResolvedValue(receiptIds.map((id, index) => ({
      id,
      purchase_order_id: purchaseOrderIds[index],
      lines: index === 0
        ? [
          { id: "line-1-verified", rmGrnVerification: { id: "verification-1", allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [] }] } },
          { id: "line-1-pending", rmGrnVerification: { id: "verification-zero", allocations: [] } },
        ]
        : [{ id: `line-${index + 1}`, rmGrnVerification: { id: `verification-${index + 1}`, allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [] }] } }],
    })));
    const grnStatus = await getOrganizationDummyDataStatus("user-id", "public-org-id");
    expect(grnStatus).toMatchObject({
      gateEntryCount: 5,
      grnCount: 5,
      verificationLineCount: 6,
      verifiedLineCount: 5,
      completedSteps: [1, 2, 3, 4, 5, 6],
      currentStep: 7,
    });
    prismaMock.inventoryReceipt.findMany.mockResolvedValue(receiptIds.map((id, index) => ({
      id,
      purchase_order_id: purchaseOrderIds[index],
      lines: index === 0
        ? [
          { id: "line-1-verified", rmGrnVerification: { id: "verification-1", allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [] }] } },
          { id: "line-1-pending", rmGrnVerification: { id: "verification-2", allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [] }] } },
        ]
        : [{ id: `line-${index + 1}`, rmGrnVerification: { id: `verification-${index + 1}`, allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [] }] } }],
    })));
    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toMatchObject({
        gateEntryCount: 5,
        grnCount: 5,
        verificationLineCount: 6,
        verifiedLineCount: 6,
        completedSteps: [1, 2, 3, 4, 5, 6, 7],
        currentStep: 8,
      });
    prismaMock.inventoryReceipt.findMany.mockResolvedValue(receiptIds.map((id, index) => ({
      id,
      purchase_order_id: purchaseOrderIds[index],
      lines: index === 0
        ? [
          { id: "line-1-verified", rmGrnVerification: { id: "verification-1", allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [{ allocated_quantity: new Prisma.Decimal("1") }] }] } },
          { id: "line-1-pending", rmGrnVerification: { id: "verification-2", allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [{ allocated_quantity: new Prisma.Decimal("1") }] }] } },
        ]
        : [{ id: `line-${index + 1}`, rmGrnVerification: { id: `verification-${index + 1}`, allocations: [{ verification_allocated: new Prisma.Decimal("1"), orderAllocations: [{ allocated_quantity: new Prisma.Decimal("1") }] }] } }],
    })));
    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toMatchObject({
        completedSteps: [1, 2, 3, 4, 5, 6, 7, 8],
        currentStep: 9,
        verificationAllocationCount: 6,
        completedOrderAllocationCount: 6,
      });
    prismaMock.factoryWorkOrder.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `work-order-${index + 1}`,
        order_id: `sample-order-${index + 1}`,
      })),
    );
    await expect(getOrganizationDummyDataStatus("user-id", "public-org-id"))
      .resolves.toMatchObject({
        completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        currentStep: 9,
        sampleWorkOrderCount: 5,
      });
  });
});
