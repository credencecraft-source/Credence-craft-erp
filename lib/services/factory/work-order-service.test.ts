import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => {
  const merchandisingOrderFindFirst = vi.fn();
  const factoryWorkOrderCreate = vi.fn();
  const factoryWorkOrderFindFirst = vi.fn();
  const factoryWorkOrderFindMany = vi.fn();
  const factoryWorkOrderBomLineFindMany = vi.fn();
  const rmGrnOrderAllocationFindMany = vi.fn();
  const transaction = {
    merchandisingOrder: { findFirst: merchandisingOrderFindFirst },
    factoryWorkOrder: { create: factoryWorkOrderCreate },
    factoryWorkOrderBomLine: { createMany: vi.fn() },
    challanNumberConfiguration: { upsert: vi.fn(), update: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return {
    merchandisingOrderFindFirst,
    factoryWorkOrderCreate,
    factoryWorkOrderFindFirst,
    factoryWorkOrderFindMany,
    factoryWorkOrderBomLineFindMany,
    rmGrnOrderAllocationFindMany,
    transaction,
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
    reserveChallanNumber: vi.fn(),
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
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

import { createWorkOrders, listWorkOrders } from "./work-order-service";

describe("factory work-order batch creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveChallanNumber.mockResolvedValue("WO-1");
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.factoryWorkOrderFindMany.mockResolvedValue([]);
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
