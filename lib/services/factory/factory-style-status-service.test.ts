import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  auditEventFindMany: vi.fn(),
  requireOrganizationPermission: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    merchandisingOrder: { findMany: mocks.orderFindMany },
    auditEvent: { findMany: mocks.auditEventFindMany },
  },
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import { listFactoryStyleStatusOrders } from "./factory-style-status-service";

describe("listFactoryStyleStatusOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationPermission.mockResolvedValue({ organization_id: "internal-org-1" });
    mocks.orderFindMany.mockResolvedValue([{
      id: "order-1",
      orderNo: "OD-100",
      brand: "Northstar",
      styleName: "Ridge Jacket",
      workOrders: [{
        id: "work-1",
        work_order_no: "WO-100",
        status: "OPEN",
        total_qty: 100,
        created_at: new Date("2026-10-02T09:00:00.000Z"),
        processController: {
          processes: [{
            process_id: "process-1",
            process_name: "Stitching",
            order_qty: 100,
            created_qty: 80,
            completed_qty: 70,
            received_qty: 60,
            status: "IN_PROGRESS",
            productionUpdates: [{ created_at: new Date("2026-10-03T09:00:00.000Z") }],
          }],
        },
        shopFloorTransfers: [{
          id: "transfer-1",
          quantity: 60,
          status: "RECEIVED",
          is_final: false,
          sent_at: new Date("2026-10-03T10:00:00.000Z"),
          received_at: new Date("2026-10-03T11:00:00.000Z"),
          fromProcess: { process_name: "Stitching" },
          toProcess: { process_name: "Finishing" },
        }],
        grns: [{
          id: "process-grn-1",
          grn_no: "FGRN-100",
          grn_date: new Date("2026-10-03T00:00:00.000Z"),
          received_qty: 60,
          status: "APPROVED",
          approved_at: new Date("2026-10-03T12:00:00.000Z"),
          fromProcess: { process_name: "Stitching" },
          toProcess: { process_name: "Finishing" },
        }],
        inventoryGrns: [{
          id: "inventory-grn-1",
          grn_no: "WOGRN-100",
          grn_date: new Date("2026-10-05T00:00:00.000Z"),
          status: "VERIFIED",
          verified_at: new Date("2026-10-05T09:00:00.000Z"),
          lines: [{ received_quantity: 50, approved_quantity: 45 }],
        }],
        finishedGoodsAllocatedStockReceipts: [{
          id: "fg-receipt-1",
          grn_no: "WOGRN-100",
          posted_at: new Date("2026-10-05T10:00:00.000Z"),
          approved_quantity: 45,
          size: "M",
        }],
      }],
    }]);
    mocks.auditEventFindMany.mockResolvedValue([
      {
        entity_type: "FactoryWorkOrder",
        entity_id: "work-1",
        action: "CREATE_WORK_ORDER",
        user: { full_name: "Factory Operator" },
      },
    ]);
  });

  it("returns tenant-scoped work-order, production, process-flow, and finished-goods status", async () => {
    const rows = await listFactoryStyleStatusOrders("user-1", "public-org-1");

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "VIEW_FACTORY_PRODUCTION",
    );
    expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
    }));
    expect(rows[0]).toMatchObject({
      orderNo: "OD-100",
      workOrders: [{
        documentNo: "WO-100",
        createdBy: "Factory Operator",
        detail: "100 units",
      }],
      processes: [{
        processName: "Stitching",
        plannedQuantity: 100,
        producedQuantity: 80,
        completedQuantity: 70,
        receivedQuantity: 60,
        status: "IN_PROGRESS",
      }],
      transfers: [
        { documentNo: "Stitching → Finishing", status: "RECEIVED" },
        { documentNo: "FGRN-100", status: "APPROVED" },
      ],
      finishedGoods: [
        { documentNo: "WOGRN-100", detail: "45 approved of 50 received" },
        { documentNo: "WOGRN-100", status: "POSTED", detail: "45 approved · size M" },
      ],
      plannedFinishedGoodsQuantity: 100,
      approvedFinishedGoodsQuantity: 45,
    });
    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        entity_id: { in: ["order-1", "work-1"] },
      }),
    }));
  });

  it("returns no orders without querying audit events", async () => {
    mocks.orderFindMany.mockResolvedValue([]);

    await expect(listFactoryStyleStatusOrders("user-1", "public-org-1")).resolves.toEqual([]);

    expect(mocks.auditEventFindMany).not.toHaveBeenCalled();
  });
});
