import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allocatedQuantities: vi.fn(),
  reserveNumber: vi.fn(),
  createAuditEvent: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  tx: {
    factoryWorkOrder: { findFirst: vi.fn() },
    rawMaterialOutwardRequestLine: { findMany: vi.fn(), updateMany: vi.fn() },
    rawMaterialOutwardRequest: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    rawMaterialOutwardBox: { findMany: vi.fn(), create: vi.fn() },
    rawMaterialOutwardBoxLine: { findMany: vi.fn(), createMany: vi.fn() },
    rawMaterialOutwardShipment: { create: vi.fn() },
    rawMaterialOutwardShipmentBox: { createMany: vi.fn() },
  },
  prisma: {
    $transaction: vi.fn(),
    rawMaterialOutwardRequest: { findMany: vi.fn() },
    groupedPurchaseOrderLine: { findFirst: vi.fn(), findMany: vi.fn() },
    rawMaterialOutwardRequestLine: { findMany: vi.fn() },
    rmGrnOrderAllocation: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/factory/work-order-material-allocation-service", () => ({
  getWorkOrderBomAllocatedQuantities: mocks.allocatedQuantities,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveNumber,
}));

import { Prisma } from "@prisma/client";
import {
  acceptRawMaterialOutwardRequest,
  createRawMaterialOutwardBox,
  createRawMaterialOutwardShipment,
  createWorkOrderMaterialRequest,
  getRawMaterialPickHistoryForGroupedLine,
  getRawMaterialPickSummariesForGroupedLines,
  listRawMaterialOutwardWorkflow,
} from "./raw-material-outward-service";

describe("raw-material-outward-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.reserveNumber.mockResolvedValue("RMR-1");
    mocks.createAuditEvent.mockResolvedValue({});
    mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "org-1", role: "INVENTORY" });
  });

  it("requests only the newly allocated balance for a work-order BOM", async () => {
    mocks.tx.factoryWorkOrder.findFirst.mockResolvedValue({
      id: "wo-1",
      work_order_no: "WO-001",
      bomLines: [
        { id: "line-1", source_bom_item_id: "bom-1", raw_material_name: "Cotton", category: "Fabric", size: "M" },
        { id: "line-2", source_bom_item_id: "bom-2", raw_material_name: "Thread", category: "Trim", size: null },
      ],
    });
    mocks.allocatedQuantities.mockResolvedValue(new Map([
      ["line-1", new Prisma.Decimal("10")],
      ["line-2", new Prisma.Decimal("1")],
    ]));
    mocks.tx.rawMaterialOutwardRequestLine.findMany.mockResolvedValue([
      { work_order_bom_line_id: "line-1", requested_quantity: new Prisma.Decimal("6") },
    ]);
    mocks.tx.rawMaterialOutwardRequest.create.mockResolvedValue({
      id: "request-1",
      request_no: "RMR-1",
      status: "REQUESTED",
    });

    const result = await createWorkOrderMaterialRequest({
      organizationId: "org-internal-1",
      workOrderId: "wo-1",
      requestedBy: "Factory User",
      actorId: "user-1",
    });

    expect(result.request_no).toBe("RMR-1");
    expect(mocks.allocatedQuantities).toHaveBeenCalledWith("org-internal-1", ["line-1", "line-2"], mocks.tx);
    expect(mocks.tx.rawMaterialOutwardRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-internal-1",
        work_order_id: "wo-1",
        request_no: "RMR-1",
        lines: {
          create: [
            expect.objectContaining({
              work_order_bom_line_id: "line-1",
              allocated_quantity: new Prisma.Decimal("10"),
              requested_quantity: new Prisma.Decimal("4"),
            }),
            expect.objectContaining({
              work_order_bom_line_id: "line-2",
              allocated_quantity: new Prisma.Decimal("1"),
              requested_quantity: new Prisma.Decimal("1"),
            }),
          ],
        },
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "RAW_MATERIAL_OUTWARD_REQUESTED",
      entityId: "request-1",
    }), mocks.tx);
  });

  it("moves accepted requests and their items into the pick queue", async () => {
    mocks.tx.rawMaterialOutwardRequest.findFirst.mockResolvedValue({ id: "request-1", request_no: "RMR-1" });
    mocks.tx.rawMaterialOutwardRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.rawMaterialOutwardRequestLine.updateMany.mockResolvedValue({ count: 2 });

    await acceptRawMaterialOutwardRequest({
      organizationId: "org-1",
      requestId: "request-1",
      actorId: "user-1",
      actorName: "Store User",
    });

    expect(mocks.tx.rawMaterialOutwardRequestLine.updateMany).toHaveBeenCalledWith({
      where: { request_id: "request-1", organization_id: "org-1", status: "REQUESTED" },
      data: { status: "ACCEPTED" },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "RAW_MATERIAL_OUTWARD_ACCEPTED",
      entityId: "request-1",
    }), mocks.tx);
  });

  it("boxes the full picked balance remaining and creates tenant-scoped box lines", async () => {
    mocks.reserveNumber.mockResolvedValue("RM-BOX-1");
    mocks.tx.rawMaterialOutwardRequestLine.findMany
      .mockResolvedValueOnce([
        { id: "line-1", request_id: "request-1", picked_quantity: new Prisma.Decimal("5") },
      ])
      .mockResolvedValueOnce([{ status: "PACKED" }]);
    mocks.tx.rawMaterialOutwardBoxLine.findMany.mockResolvedValue([
      { request_line_id: "line-1", quantity: new Prisma.Decimal("2") },
    ]);
    mocks.tx.rawMaterialOutwardBox.create.mockResolvedValue({
      id: "box-1",
      box_no: "RM-BOX-1",
      packed_at: new Date("2026-10-05T12:00:00Z"),
    });
    mocks.tx.rawMaterialOutwardBoxLine.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.rawMaterialOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });

    const result = await createRawMaterialOutwardBox({
      organizationId: "org-1",
      actorId: "user-1",
      actorName: "Store User",
      requestLineIds: ["line-1"],
    });
    expect(result.box_no).toBe("RM-BOX-1");
    expect(mocks.tx.rawMaterialOutwardBox.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { organization_id: "org-1", box_no: "RM-BOX-1", packed_by: "Store User" },
    }));
    expect(mocks.tx.rawMaterialOutwardBoxLine.createMany).toHaveBeenCalledWith({
      data: [{
        organization_id: "org-1",
        box_id: "box-1",
        request_line_id: "line-1",
        quantity: new Prisma.Decimal("3"),
      }],
    });
    expect(mocks.tx.rawMaterialOutwardBox.create.mock.calls[0][0].data.lines).toBeUndefined();
    expect(mocks.tx.rawMaterialOutwardRequestLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "line-1", organization_id: "org-1", status: { in: ["PICKED", "PACKED"] } },
      data: { status: "PACKED" },
    }));
  });

  it("creates a uniquely numbered packing list from organization-scoped boxes", async () => {
    mocks.reserveNumber.mockResolvedValue("RM-PL-42");
    mocks.tx.rawMaterialOutwardBox.findMany.mockResolvedValue([{
      id: "box-1",
      box_no: "RM-BOX-5",
      lines: [{ request_line_id: "line-1", quantity: new Prisma.Decimal("4") }],
    }]);
    mocks.tx.rawMaterialOutwardShipment.create.mockResolvedValue({
      id: "shipment-1",
      packing_list_no: "RM-PL-42",
      shipped_at: new Date("2026-10-05T12:00:00Z"),
    });
    mocks.tx.rawMaterialOutwardShipmentBox.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.rawMaterialOutwardBoxLine.findMany.mockResolvedValue([{
      request_line_id: "line-1",
      quantity: new Prisma.Decimal("4"),
      box: { shipment: { shipment_id: "shipment-1" } },
    }]);
    mocks.tx.rawMaterialOutwardRequestLine.findMany
      .mockResolvedValueOnce([{
        id: "line-1",
        request_id: "request-1",
        requested_quantity: new Prisma.Decimal("4"),
      }])
      .mockResolvedValueOnce([{ status: "SHIPPED" }]);
    mocks.tx.rawMaterialOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.rawMaterialOutwardRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await createRawMaterialOutwardShipment({
      organizationId: "org-1",
      actorId: "user-1",
      actorName: "Store User",
      boxIds: ["box-1"],
    });

    expect(result.packing_list_no).toBe("RM-PL-42");
    expect(mocks.tx.rawMaterialOutwardBox.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["box-1"] }, organization_id: "org-1", shipment: { is: null } },
    }));
    expect(mocks.reserveNumber).toHaveBeenCalledWith("org-1", "RM_OUTWARD_PACKING_LIST", mocks.tx);
    expect(mocks.tx.rawMaterialOutwardShipment.create).toHaveBeenCalledWith({
      data: {
        organization_id: "org-1",
        packing_list_no: "RM-PL-42",
        shipped_by: "Store User",
      },
      select: { id: true, packing_list_no: true, shipped_at: true },
    });
    expect(mocks.tx.rawMaterialOutwardShipmentBox.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: "org-1", shipment_id: "shipment-1", box_id: "box-1" }],
    });
    expect(mocks.tx.rawMaterialOutwardShipment.create.mock.calls[0][0].data.boxes).toBeUndefined();
    expect(mocks.tx.rawMaterialOutwardRequestLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "line-1", organization_id: "org-1", status: "PACKED" },
      data: { status: "SHIPPED" },
    }));
  });

  it("returns requested and picked quantities by request line for BOM progress", async () => {
    mocks.prisma.rawMaterialOutwardRequest.findMany.mockResolvedValue([{
      id: "request-1",
      work_order_id: "wo-1",
      request_no: "RMR-1",
      status: "SHIPPED",
      requested_at: new Date("2026-10-05T12:00:00Z"),
      requested_by: "Factory User",
      workOrder: { work_order_no: "WO-1", order_no: "ORD-1" },
      lines: [{
        id: "line-1",
        work_order_bom_line_id: "bom-line-1",
        raw_material: "Cotton",
        category: "Fabric",
        size: "M",
        allocated_quantity: new Prisma.Decimal("10"),
        requested_quantity: new Prisma.Decimal("6"),
        picked_quantity: new Prisma.Decimal("6"),
        status: "SHIPPED",
        picked_by: "Store User",
        picked_at: new Date("2026-10-05T12:01:00Z"),
      }],
    }]);

    const result = await listRawMaterialOutwardWorkflow("org-1", "user-1", "wo-1");

    expect(result.requests[0].lines[0]).toMatchObject({
      workOrderBomLineId: "bom-line-1",
      requestedQuantity: "6",
      pickedQuantity: "6",
    });
    expect(mocks.prisma.rawMaterialOutwardRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", work_order_id: "wo-1" },
      include: expect.objectContaining({
        lines: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
      }),
    }));
  });

  it("loads tenant-scoped picked history for the selected allocated BOM line", async () => {
    mocks.prisma.groupedPurchaseOrderLine.findFirst.mockResolvedValue({
      id: "group-line-1",
      source_bom_item_id: "bom-item-1",
      order_no: "ORD-1",
      style_name: "STYLE-1",
      item_name: "Cotton",
      grouped_qty: new Prisma.Decimal("20"),
      sourceOrder: { orderNo: "ORD-1", styleName: "STYLE-1", article: "ART-1" },
    });
    mocks.prisma.rmGrnOrderAllocation.findMany.mockResolvedValue([
      { allocated_quantity: new Prisma.Decimal("8") },
      { allocated_quantity: new Prisma.Decimal("2") },
    ]);
    mocks.prisma.rawMaterialOutwardRequestLine.findMany.mockResolvedValue([{
      id: "request-line-1",
      raw_material: "Cotton",
      category: "Fabric",
      size: "M",
      requested_quantity: new Prisma.Decimal("10"),
      picked_quantity: new Prisma.Decimal("8"),
      picked_by: "Store User",
      picked_at: new Date("2026-10-05T12:10:00Z"),
      request: {
        requested_by: "Factory User",
        requested_at: new Date("2026-10-05T12:00:00Z"),
        workOrder: {
          work_order_no: "WO-1",
          order_no: "ORD-1",
          order: { orderNo: "ORD-1", styleName: "STYLE-1", article: "ART-1" },
        },
      },
    }]);

    const result = await getRawMaterialPickHistoryForGroupedLine("org-1", "user-1", "group-line-1");

    expect(result).toMatchObject({
      rawMaterialName: "Cotton",
      orderNo: "ORD-1",
      styleNo: "STYLE-1",
      groupedQuantity: "20",
      allocatedQuantity: "10",
      availableStock: "2",
      requestedTotal: "10",
      pickedTotal: "8",
      records: [{
        orderNo: "ORD-1",
        styleNo: "STYLE-1",
        workOrderNo: "WO-1",
        requestedBy: "Factory User",
        requestedQuantity: "10",
        pickedBy: "Store User",
        pickedQuantity: "8",
      }],
    });
    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith("user-1", "org-1");
    expect(mocks.prisma.groupedPurchaseOrderLine.findFirst).toHaveBeenCalledWith({
      where: {
        id: "group-line-1",
        groupedPurchaseOrder: { organization_id: "org-1" },
        sourceOrder: { organization_id: "org-1" },
      },
      select: expect.any(Object),
    });
    expect(mocks.prisma.rawMaterialOutwardRequestLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-1",
        picked_quantity: { gt: 0 },
        workOrderBomLine: {
          source_bom_item_id: "bom-item-1",
          workOrder: { organization_id: "org-1" },
        },
        request: { organization_id: "org-1" },
      },
    }));
    expect(mocks.prisma.rmGrnOrderAllocation.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        grouped_purchase_order_line_id: "group-line-1",
        groupedPurchaseOrderLine: { groupedPurchaseOrder: { organization_id: "org-1" } },
      },
      select: { allocated_quantity: true },
    });
  });

  it("summarizes picked and allocated balance for style-wise report lines", async () => {
    mocks.prisma.groupedPurchaseOrderLine.findMany.mockResolvedValue([
      { id: "group-line-1", source_bom_item_id: "bom-1" },
      { id: "group-line-2", source_bom_item_id: "bom-2" },
    ]);
    mocks.prisma.rmGrnOrderAllocation.findMany.mockResolvedValue([
      { grouped_purchase_order_line_id: "group-line-1", allocated_quantity: new Prisma.Decimal("15") },
      { grouped_purchase_order_line_id: "group-line-1", allocated_quantity: new Prisma.Decimal("5") },
      { grouped_purchase_order_line_id: "group-line-2", allocated_quantity: new Prisma.Decimal("3") },
    ]);
    mocks.prisma.rawMaterialOutwardRequestLine.findMany.mockResolvedValue([
      { picked_quantity: new Prisma.Decimal("8"), workOrderBomLine: { source_bom_item_id: "bom-1" } },
      { picked_quantity: new Prisma.Decimal("4"), workOrderBomLine: { source_bom_item_id: "bom-1" } },
      { picked_quantity: new Prisma.Decimal("5"), workOrderBomLine: { source_bom_item_id: "bom-2" } },
    ]);

    const result = await getRawMaterialPickSummariesForGroupedLines("org-1", "user-1", ["group-line-1", "group-line-2"]);

    expect(result).toEqual({
      "group-line-1": { pickedQuantity: "12", balanceStock: "8" },
      "group-line-2": { pickedQuantity: "5", balanceStock: "0" },
    });
    expect(mocks.prisma.rawMaterialOutwardRequestLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-1",
        picked_quantity: { gt: 0 },
        workOrderBomLine: {
          source_bom_item_id: { in: ["bom-1", "bom-2"] },
          workOrder: { organization_id: "org-1" },
        },
        request: { organization_id: "org-1" },
      },
    }));
  });
});
