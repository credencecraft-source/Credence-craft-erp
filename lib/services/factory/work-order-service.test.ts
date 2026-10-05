import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => {
  const merchandisingOrderFindFirst = vi.fn();
  const factoryWorkOrderCreate = vi.fn();
  const factoryWorkOrderFindFirst = vi.fn();
  const factoryWorkOrderFindMany = vi.fn();
  const factoryWorkOrderDelete = vi.fn();
  const factoryWorkOrderBomLineFindMany = vi.fn();
  const rmGrnOrderAllocationFindMany = vi.fn();
  const merchandisingOrderFindMany = vi.fn();
  const merchandisingOrderFindManyInTransaction = vi.fn();
  const factoryWorkOrderFindManyInTransaction = vi.fn();
  const orderProcessControllerFindUnique = vi.fn();
  const orderProcessControllerCreate = vi.fn();
  const masterProcessTemplateFindFirst = vi.fn();
  const transaction = {
    merchandisingOrder: { findFirst: merchandisingOrderFindFirst, findMany: merchandisingOrderFindManyInTransaction },
    factoryWorkOrder: {
      create: factoryWorkOrderCreate,
      findFirst: factoryWorkOrderFindFirst,
      findMany: factoryWorkOrderFindManyInTransaction,
      delete: factoryWorkOrderDelete,
    },
    orderProcessController: { findUnique: orderProcessControllerFindUnique, create: orderProcessControllerCreate },
    orderProcessControllerProcess: { create: vi.fn() },
    masterProcessTemplate: { findFirst: masterProcessTemplateFindFirst },
    workOrderProcessController: { create: vi.fn() },
    rawMaterialOutwardRequest: { findMany: vi.fn(), deleteMany: vi.fn() },
    rawMaterialOutwardRequestLine: { deleteMany: vi.fn() },
    factoryWorkOrderBomLine: { createMany: vi.fn() },
    challanNumberConfiguration: { upsert: vi.fn(), update: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return {
    merchandisingOrderFindFirst,
    factoryWorkOrderCreate,
    factoryWorkOrderFindFirst,
    factoryWorkOrderFindMany,
    factoryWorkOrderDelete,
    factoryWorkOrderBomLineFindMany,
    rmGrnOrderAllocationFindMany,
    merchandisingOrderFindMany,
    merchandisingOrderFindManyInTransaction,
    factoryWorkOrderFindManyInTransaction,
    orderProcessControllerFindUnique,
    orderProcessControllerCreate,
    masterProcessTemplateFindFirst,
    transaction,
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
    reserveChallanNumber: vi.fn(),
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    merchandisingOrder: { findMany: mocks.merchandisingOrderFindMany },
    factoryWorkOrder: { findFirst: mocks.factoryWorkOrderFindFirst, findMany: mocks.factoryWorkOrderFindMany },
    factoryWorkOrderBomLine: { findMany: mocks.factoryWorkOrderBomLineFindMany },
    rmGrnOrderAllocation: { findMany: mocks.rmGrnOrderAllocationFindMany },
  },
}));

vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: mocks.reserveChallanNumber,
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  createWorkOrders,
  createWorkOrdersForSampleOrders,
  deleteWorkOrder,
  listWorkOrderArticles,
  listWorkOrders,
} from "./work-order-service";

describe("factory work-order batch creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveChallanNumber.mockResolvedValue("WO-1");
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.factoryWorkOrderFindMany.mockResolvedValue([]);
    mocks.merchandisingOrderFindManyInTransaction.mockResolvedValue([]);
    mocks.factoryWorkOrderFindManyInTransaction.mockResolvedValue([]);
    mocks.orderProcessControllerFindUnique.mockResolvedValue(null);
    mocks.masterProcessTemplateFindFirst.mockResolvedValue(null);
    mocks.rmGrnOrderAllocationFindMany.mockResolvedValue([]);
    mocks.factoryWorkOrderBomLineFindMany.mockImplementation(({ where }: { where: { id?: { in: string[] }; source_bom_item_id?: { in: string[] } } }) => (
      "id" in where
        ? Promise.resolve([
          { id: "work-order-bom-line-1", source_bom_item_id: "bom-item-1" },
          { id: "work-order-bom-line-2", source_bom_item_id: "bom-item-2" },
        ])
        : Promise.resolve([
          { id: "work-order-bom-line-1", source_bom_item_id: "bom-item-1", total_required_qty: new Prisma.Decimal("22") },
          { id: "work-order-bom-line-2", source_bom_item_id: "bom-item-2", total_required_qty: new Prisma.Decimal("5.5") },
        ])
    ));
    mocks.merchandisingOrderFindFirst.mockImplementation(async ({ where }: { where: { orderNo: string } }) => ({
      id: `source-${where.orderNo}`,
      orderNo: where.orderNo,
      finishedGoods: [{ id: `size-${where.orderNo}`, size: "M", buyerSize: "M", totalQty: 10 }],
      processTemplate: null,
      process_template_id: null,
      processSteps: [],
      bomItems: [],
      workOrders: [],
    }));
    let nextId = 0;
    mocks.factoryWorkOrderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      nextId += 1;
      const sizeLines = data.sizeLines as { create: Array<Record<string, unknown>> };
      return {
        id: `work-order-${nextId}`,
        work_order_no: data.work_order_no,
        total_qty: data.total_qty,
        sizeLines: sizeLines.create.map((line, index) => ({ id: `line-${nextId}-${index}`, ...line })),
      };
    });
  });

  describe("factory work-order article options", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("lists distinct, non-empty article values from only the requested organization's orders", async () => {
      mocks.merchandisingOrderFindMany.mockResolvedValue([
        { article: "ARTICLE-1" },
        { article: "article-1" },
        { article: " ARTICLE-2 " },
        { article: " " },
        { article: null },
      ]);

      await expect(listWorkOrderArticles("internal-org-1"))
        .resolves.toEqual({ articles: ["ARTICLE-1", "ARTICLE-2"] });

      expect(mocks.merchandisingOrderFindMany).toHaveBeenCalledWith({
        where: { organization_id: "internal-org-1", article: { not: null } },
        select: { article: true },
        distinct: ["article"],
        orderBy: { article: "asc" },
      });
    });
  });

  describe("factory work-order deletion", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.createAuditEvent.mockResolvedValue(undefined);
      mocks.transaction.rawMaterialOutwardRequest.findMany.mockResolvedValue([]);
    });

    it("rejects deletion when an outward request is linked and preserves its inventory history", async () => {
      mocks.factoryWorkOrderFindFirst.mockResolvedValue({
        id: "work-order-1",
        status: "OPEN",
        rawMaterialOutwardRequests: [{ request_no: "RM-OUT-1" }],
        productionUpdates: [],
        bundleTransfers: [],
        grns: [],
        dailyProductionReportLines: [],
        processController: null,
      });

      await expect(deleteWorkOrder("internal-org-1", "user-1", "work-order-1"))
        .rejects.toThrow("raw-material outward request RM-OUT-1");

      expect(mocks.factoryWorkOrderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "work-order-1", organization_id: "internal-org-1" },
        select: expect.objectContaining({
          rawMaterialOutwardRequests: {
            where: { organization_id: "internal-org-1", status: { not: "CANCELLED" } },
            select: { request_no: true },
            take: 1,
          },
        }),
      }));
      expect(mocks.createAuditEvent).not.toHaveBeenCalled();
      expect(mocks.factoryWorkOrderDelete).not.toHaveBeenCalled();
    });

    it("allows deleting an untouched OPEN work order when its only outward request was cancelled", async () => {
      mocks.factoryWorkOrderFindFirst.mockResolvedValue({
        id: "work-order-1",
        status: "OPEN",
        rawMaterialOutwardRequests: [],
        productionUpdates: [],
        bundleTransfers: [],
        grns: [],
        dailyProductionReportLines: [],
        processController: null,
      });
      mocks.transaction.rawMaterialOutwardRequest.findMany.mockResolvedValue([{
        id: "cancelled-request-1",
        request_no: "RMR-1",
        lines: [{ id: "cancelled-line-1", status: "CANCELLED", boxLines: [] }],
      }]);
      mocks.transaction.rawMaterialOutwardRequestLine.deleteMany.mockResolvedValue({ count: 1 });
      mocks.transaction.rawMaterialOutwardRequest.deleteMany.mockResolvedValue({ count: 1 });

      await expect(deleteWorkOrder("internal-org-1", "user-1", "work-order-1")).resolves.toBeUndefined();

      expect(mocks.transaction.rawMaterialOutwardRequestLine.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["cancelled-line-1"] },
          organization_id: "internal-org-1",
          status: "CANCELLED",
        },
      });
      expect(mocks.transaction.rawMaterialOutwardRequest.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["cancelled-request-1"] },
          organization_id: "internal-org-1",
          status: "CANCELLED",
        },
      });
      expect(mocks.factoryWorkOrderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "work-order-1", organization_id: "internal-org-1" },
        select: expect.objectContaining({
          rawMaterialOutwardRequests: {
            where: { organization_id: "internal-org-1", status: { not: "CANCELLED" } },
            select: { request_no: true },
            take: 1,
          },
        }),
      }));
      expect(mocks.factoryWorkOrderDelete).toHaveBeenCalledWith({ where: { id: "work-order-1" } });
    });

    it("uses the request model to find cancelled records before deleting the work order", async () => {
      mocks.factoryWorkOrderFindFirst.mockResolvedValue({
        id: "work-order-1",
        status: "OPEN",
        rawMaterialOutwardRequests: [],
        productionUpdates: [],
        bundleTransfers: [],
        grns: [],
        dailyProductionReportLines: [],
        processController: null,
      });
      mocks.transaction.rawMaterialOutwardRequest.findMany.mockResolvedValue([{
        id: "cancelled-request-1",
        request_no: "RMR-1",
        lines: [{ id: "cancelled-line-1", status: "CANCELLED", boxLines: [] }],
      }]);
      mocks.transaction.rawMaterialOutwardRequestLine.deleteMany.mockResolvedValue({ count: 1 });
      mocks.transaction.rawMaterialOutwardRequest.deleteMany.mockResolvedValue({ count: 1 });

      await expect(deleteWorkOrder("internal-org-1", "user-1", "work-order-1")).resolves.toBeUndefined();

      expect(mocks.transaction.rawMaterialOutwardRequest.findMany).toHaveBeenCalledWith({
        where: {
          organization_id: "internal-org-1",
          work_order_id: "work-order-1",
          status: "CANCELLED",
        },
        select: {
          id: true,
          request_no: true,
          lines: {
            select: {
              id: true,
              status: true,
              boxLines: { select: { id: true }, take: 1 },
            },
          },
        },
      });
      expect(mocks.transaction.rawMaterialOutwardRequestLine.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["cancelled-line-1"] },
          organization_id: "internal-org-1",
          status: "CANCELLED",
        },
      });
      expect(mocks.transaction.rawMaterialOutwardRequest.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["cancelled-request-1"] },
          organization_id: "internal-org-1",
          status: "CANCELLED",
        },
      });
      expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: "DELETE_WORK_ORDER",
        entityId: "work-order-1",
        details: { removedCancelledOutwardRequests: ["RMR-1"] },
      }), mocks.transaction);
      expect(mocks.factoryWorkOrderDelete).toHaveBeenCalledWith({ where: { id: "work-order-1" } });
    });

    it("keeps the work order if cancelled request lines are not all cancelled", async () => {
      mocks.factoryWorkOrderFindFirst.mockResolvedValue({
        id: "work-order-1",
        status: "OPEN",
        rawMaterialOutwardRequests: [],
        productionUpdates: [],
        bundleTransfers: [],
        grns: [],
        dailyProductionReportLines: [],
        processController: null,
      });
      mocks.transaction.rawMaterialOutwardRequest.findMany.mockResolvedValue([{
        id: "cancelled-request-1",
        request_no: "RMR-1",
        lines: [{ id: "line-1", status: "PICKED", boxLines: [] }],
      }]);

      await expect(deleteWorkOrder("internal-org-1", "user-1", "work-order-1"))
        .rejects.toThrow("incomplete cancellation history");

      expect(mocks.transaction.rawMaterialOutwardRequestLine.deleteMany).not.toHaveBeenCalled();
      expect(mocks.transaction.rawMaterialOutwardRequest.deleteMany).not.toHaveBeenCalled();
      expect(mocks.factoryWorkOrderDelete).not.toHaveBeenCalled();
    });

    it("keeps the work order if a cancelled request line still has a box record", async () => {
      mocks.factoryWorkOrderFindFirst.mockResolvedValue({
        id: "work-order-1",
        status: "OPEN",
        rawMaterialOutwardRequests: [],
        productionUpdates: [],
        bundleTransfers: [],
        grns: [],
        dailyProductionReportLines: [],
        processController: null,
      });
      mocks.transaction.rawMaterialOutwardRequest.findMany.mockResolvedValue([{
        id: "cancelled-request-1",
        request_no: "RMR-1",
        lines: [{ id: "line-1", status: "CANCELLED", boxLines: [{ id: "box-line-1" }] }],
      }]);

      await expect(deleteWorkOrder("internal-org-1", "user-1", "work-order-1"))
        .rejects.toThrow("incomplete cancellation history");

      expect(mocks.transaction.rawMaterialOutwardRequestLine.deleteMany).not.toHaveBeenCalled();
      expect(mocks.transaction.rawMaterialOutwardRequest.deleteMany).not.toHaveBeenCalled();
      expect(mocks.factoryWorkOrderDelete).not.toHaveBeenCalled();
    });

    it("still deletes an untouched OPEN work order without linked requests", async () => {
      mocks.factoryWorkOrderFindFirst.mockResolvedValue({
        id: "work-order-1",
        status: "OPEN",
        rawMaterialOutwardRequests: [],
        productionUpdates: [],
        bundleTransfers: [],
        grns: [],
        dailyProductionReportLines: [],
        processController: null,
      });

      await expect(deleteWorkOrder("internal-org-1", "user-1", "work-order-1")).resolves.toBeUndefined();

      expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: "internal-org-1",
        userId: "user-1",
        action: "DELETE_WORK_ORDER",
        entityId: "work-order-1",
      }), mocks.transaction);
      expect(mocks.factoryWorkOrderDelete).toHaveBeenCalledWith({ where: { id: "work-order-1" } });
    });
  });

  it("creates a multi-order request inside one serializable transaction", async () => {
    const workOrders = await createWorkOrders("internal-org-1", "user-1", [
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 4 }] },
      { orderNo: "ORD-2", lines: [{ sourceFinishedGoodsId: "size-ORD-2", quantity: 6 }] },
    ]);

    expect(workOrders).toHaveLength(2);
    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.prismaTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 10000,
      timeout: 30000,
    });
    expect(mocks.factoryWorkOrderCreate).toHaveBeenCalledTimes(2);
    expect(mocks.createAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("creates work orders for five tenant-owned demo orders with tenant-scoped reads", async () => {
    const sampleOrders = Array.from({ length: 10 }, (_, index) => ({
      id: `sample-order-${index + 1}`,
      orderNo: `ORD-${index + 1}`,
      finishedGoods: [{ id: `size-ORD-${index + 1}`, totalQty: 10 }],
    }));
    mocks.merchandisingOrderFindManyInTransaction.mockResolvedValue(sampleOrders);

    const workOrders = await createWorkOrdersForSampleOrders(
      "internal-org-1",
      "user-1",
      sampleOrders.map((order) => order.id),
    );

    expect(workOrders).toHaveLength(5);
    expect(workOrders.every((workOrder) => workOrder.created)).toBe(true);
    expect(mocks.merchandisingOrderFindManyInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        id: { in: sampleOrders.map((order) => order.id) },
        sourceStatus: "DEMO",
      },
    }));
    expect(mocks.factoryWorkOrderFindManyInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", order_id: { in: sampleOrders.map((order) => order.id) } },
    }));
    expect(mocks.factoryWorkOrderCreate).toHaveBeenCalledTimes(5);
    expect(mocks.createAuditEvent).toHaveBeenCalledTimes(5);
    expect(mocks.prismaTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 10000,
      timeout: 60000,
    });
  });

  it("reuses existing demo work orders rather than duplicating them on retry", async () => {
    const sampleOrders = Array.from({ length: 5 }, (_, index) => ({
      id: `sample-order-${index + 1}`,
      orderNo: `ORD-${index + 1}`,
      finishedGoods: [{ id: `size-ORD-${index + 1}`, totalQty: 10 }],
    }));
    mocks.merchandisingOrderFindManyInTransaction.mockResolvedValue(sampleOrders);
    mocks.factoryWorkOrderFindManyInTransaction.mockResolvedValue(sampleOrders.map((order, index) => ({
      id: `existing-work-order-${index + 1}`,
      order_id: order.id,
      work_order_no: `WO-${index + 1}`,
    })));

    const workOrders = await createWorkOrdersForSampleOrders(
      "internal-org-1",
      "user-1",
      sampleOrders.map((order) => order.id),
    );

    expect(workOrders).toHaveLength(5);
    expect(workOrders.every((workOrder) => !workOrder.created)).toBe(true);
    expect(mocks.factoryWorkOrderCreate).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("builds a process controller from the tenant template when the order has no process snapshot", async () => {
    mocks.merchandisingOrderFindFirst.mockResolvedValueOnce({
      id: "sample-order-1",
      organization_id: "internal-org-1",
      orderNo: "ORD-1",
      orderQty: 10,
      finishedGoods: [{ id: "size-ORD-1", size: "M", buyerSize: "M", totalQty: 10 }],
      processTemplate: { id: "process-template-1", value_id: null, process_name: "Sample Process" },
      process_template_id: "process-template-1",
      processSteps: [],
      bomItems: [],
      workOrders: [],
    });
    mocks.masterProcessTemplateFindFirst.mockResolvedValue({
      id: "process-template-1",
      steps: [{
        process_id: "cutting-process-id",
        process: {
          id: "cutting-process-id",
          process_name: "Cutting",
          operationTemplates: [{
            operations: [{ id: "cutting-operation-id", operation: "Cut", sl_no: 1, price: new Prisma.Decimal("2.50") }],
          }],
        },
        operationTemplate: null,
        sl_no: 1,
      }],
    });
    mocks.orderProcessControllerCreate.mockResolvedValue({
      id: "order-controller-1",
      processes: [{
        id: "order-process-1",
        process_id: "cutting-process-id",
        process_name: "Cutting",
        sl_no: 1,
        order_qty: 10,
        operations: [{
          id: "order-operation-1",
          source_operation_id: "cutting-operation-id",
          operation: "Cut",
          sl_no: 1,
          budgeted_price: new Prisma.Decimal("2.50"),
        }],
      }],
    });

    await createWorkOrders("internal-org-1", "user-1", [
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 10 }] },
    ]);

    expect(mocks.masterProcessTemplateFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "process-template-1", organization_id: "internal-org-1", is_active: true },
    }));
    expect(mocks.orderProcessControllerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        order_id: "sample-order-1",
        process_template_id: "process-template-1",
        processes: {
          create: [{
            process_id: "cutting-process-id",
            process_name: "Cutting",
            sl_no: 1,
            order_qty: 10,
            operations: {
              create: [{
                source_operation_id: "cutting-operation-id",
                operation: "Cut",
                sl_no: 1,
                budgeted_price: new Prisma.Decimal("2.50"),
              }],
            },
          }],
        },
      },
    }));
    expect(mocks.transaction.workOrderProcessController.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        work_order_id: "work-order-1",
        order_controller_id: "order-controller-1",
      }),
    }));
  });

  it("rejects duplicate orders before opening a transaction", async () => {
    await expect(createWorkOrders("internal-org-1", "user-1", [
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 4 }] },
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 2 }] },
    ])).rejects.toThrow("appears more than once");

    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("rejects batches beyond the bounded atomic size", async () => {
    const requests = Array.from({ length: 51 }, (_, index) => ({ orderNo: `ORD-${index}`, lines: [] }));

    await expect(createWorkOrders("internal-org-1", "user-1", requests)).rejects.toThrow("no more than 50 orders");
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("fails the entire batch when any member cannot be allocated", async () => {
    mocks.merchandisingOrderFindFirst.mockImplementation(async ({ where }: { where: { orderNo: string } }) => ({
      id: `source-${where.orderNo}`,
      orderNo: where.orderNo,
      finishedGoods: [{ id: `size-${where.orderNo}`, size: "M", buyerSize: "M", totalQty: where.orderNo === "ORD-2" ? 2 : 10 }],
      processTemplate: null,
      process_template_id: null,
      processSteps: [],
      bomItems: [],
      workOrders: [],
    }));

    await expect(createWorkOrders("internal-org-1", "user-1", [
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 4 }] },
      { orderNo: "ORD-2", lines: [{ sourceFinishedGoodsId: "size-ORD-2", quantity: 3 }] },
    ])).rejects.toThrow("exceeds the remaining order quantity");

    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.factoryWorkOrderCreate).toHaveBeenCalledTimes(1);
  });

  it("returns allocated RM quantity by source BOM item for the work-order BOM", async () => {
    mocks.factoryWorkOrderFindMany.mockResolvedValue([{
      id: "work-order-1",
      work_order_no: "WO-1",
      total_qty: 10,
      status: "OPEN",
      created_at: new Date("2026-10-05T00:00:00Z"),
      order: { orderNo: "ORD-1", article: null, styleName: "STYLE-1", brand: null },
      sizeLines: [],
      bomLines: [
        {
          id: "work-order-bom-line-1",
          source_bom_item_id: "bom-item-1",
          raw_material_name: "Cotton",
          category: "Fabric",
          size: null,
          work_order_qty: new Prisma.Decimal("10"),
          required_qty: new Prisma.Decimal("20"),
          total_required_qty: new Prisma.Decimal("22"),
        },
        {
          id: "work-order-bom-line-2",
          source_bom_item_id: "bom-item-2",
          raw_material_name: "Thread",
          category: "Trims",
          size: null,
          work_order_qty: new Prisma.Decimal("10"),
          required_qty: new Prisma.Decimal("5"),
          total_required_qty: new Prisma.Decimal("5.5"),
        },
      ],
    }]);
    mocks.rmGrnOrderAllocationFindMany.mockResolvedValue([
      {
        allocated_quantity: new Prisma.Decimal("3.25"),
        groupedPurchaseOrderLine: {
          source_bom_item_id: "bom-item-1",
          groupedPurchaseOrder: { organization_id: "internal-org-1" },
        },
      },
      {
        allocated_quantity: new Prisma.Decimal("1"),
        groupedPurchaseOrderLine: {
          source_bom_item_id: "bom-item-1",
          groupedPurchaseOrder: { organization_id: "internal-org-1" },
        },
      },
    ]);
    await expect(listWorkOrders("internal-org-1")).resolves.toMatchObject({
      workOrders: [{
        bomLines: [
          { id: "work-order-bom-line-1", allocatedQty: "4.25" },
          { id: "work-order-bom-line-2", allocatedQty: "0" },
        ],
      }],
      nextCursor: null,
    });
    expect(mocks.rmGrnOrderAllocationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        groupedPurchaseOrderLine: {
          source_bom_item_id: { in: ["bom-item-1", "bom-item-2"] },
          groupedPurchaseOrder: { organization_id: "internal-org-1" },
        },
      },
    }));
  });
});
