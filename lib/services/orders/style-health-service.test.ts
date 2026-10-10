import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  groupedPurchaseOrderLineFindMany: vi.fn(),
  workOrderFindMany: vi.fn(),
  auditEventFindMany: vi.fn(),
  requireOrganizationPermission: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    merchandisingOrder: { findMany: mocks.orderFindMany },
    groupedPurchaseOrderLine: { findMany: mocks.groupedPurchaseOrderLineFindMany },
    factoryWorkOrder: { findMany: mocks.workOrderFindMany },
    auditEvent: { findMany: mocks.auditEventFindMany },
  },
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import { listStyleHealthOrders } from "./style-health-service";

describe("listStyleHealthOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationPermission.mockResolvedValue({
      organization_id: "internal-org-1",
    });
    mocks.orderFindMany.mockResolvedValue([{
      id: "order-1",
      orderNo: "OD-100",
      brand: "Northstar",
      styleName: "Ridge Jacket",
      buyer: "Buyer",
      created_at: new Date("2026-10-01T09:00:00.000Z"),
      bomItems: [{
        id: "bom-fabric",
        subCategory: "Fabric",
        rawMaterialName: "Cotton",
        totalRequiredQty: 100,
        requiredQty: 100,
      }],
    }]);
    mocks.groupedPurchaseOrderLineFindMany.mockResolvedValue([{
      source_bom_item_id: "bom-fabric",
      source_order_id: "order-1",
      grouped_qty: 100,
      groupedPurchaseOrder: { created_at: new Date("2026-10-02T09:00:00.000Z") },
      rmGrnOrderAllocations: [{
        allocated_quantity: 100,
        verificationAllocation: {
          verification: {
            organization_id: "internal-org-1",
            created_at: new Date("2026-10-03T09:00:00.000Z"),
          },
        },
      }],
    }]);
    mocks.workOrderFindMany.mockResolvedValue([{
      id: "work-1",
      order_id: "order-1",
      work_order_no: "WO-100",
      status: "OPEN",
      created_at: new Date("2026-10-04T09:00:00.000Z"),
    }]);
    mocks.auditEventFindMany.mockResolvedValue([
      {
        entity_type: "MerchandisingOrder",
        entity_id: "order-1",
        action: "CREATE",
        created_at: new Date("2026-10-01T09:00:01.000Z"),
        user: { full_name: "Order Creator" },
      },
      {
        entity_type: "FactoryWorkOrder",
        entity_id: "work-1",
        action: "CREATE_WORK_ORDER",
        created_at: new Date("2026-10-04T09:00:01.000Z"),
        user: { full_name: "Work Order Creator" },
      },
    ]);
  });

  it("returns order, material, and work-order milestones", async () => {
    const rows = await listStyleHealthOrders("user-1", "public-org-1");

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "VIEW_ORDERS",
    );
    expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
    }));
    expect(mocks.workOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
    }));
    expect(mocks.groupedPurchaseOrderLineFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        source_order_id: { in: ["order-1"] },
        groupedPurchaseOrder: { is: { organization_id: "internal-org-1" } },
      },
    }));
    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        entity_id: { in: ["order-1", "work-1"] },
      }),
    }));
    expect(rows[0]).toMatchObject({
      orderNo: "OD-100",
      brand: "Northstar",
      styleName: "Ridge Jacket",
      orderCreated: [{ documentNo: "OD-100", createdBy: "Order Creator" }],
      materials: [{
        subCategory: "Fabric",
        poCreatedAt: "2026-10-02T09:00:00.000Z",
        orderedStatus: "FULL",
        receivedStatus: "FULL",
        materialReceivedAt: "2026-10-03T09:00:00.000Z",
      }],
      workOrders: [{ documentNo: "WO-100", createdBy: "Work Order Creator" }],
    });
  });

  it("aggregates full and partial PO and RM-GRN allocation quantities by BOM subcategory", async () => {
    mocks.orderFindMany.mockResolvedValue([{
      id: "order-1",
      orderNo: "OD-100",
      brand: "Northstar",
      styleName: "Ridge Jacket",
      buyer: "Buyer",
      created_at: new Date("2026-10-01T09:00:00.000Z"),
      bomItems: [
        {
          id: "bom-fabric",
          subCategory: "Fabric",
          rawMaterialName: "Cotton",
          totalRequiredQty: 100,
          requiredQty: 100,
        },
        {
          id: "bom-buttons",
          subCategory: "Buttons",
          rawMaterialName: "Buttons",
          totalRequiredQty: 50,
          requiredQty: 50,
        },
      ],
    }]);
    mocks.groupedPurchaseOrderLineFindMany.mockResolvedValue([
      {
        source_bom_item_id: "bom-fabric",
        source_order_id: "order-1",
        grouped_qty: 40,
        groupedPurchaseOrder: { created_at: new Date("2026-10-02T09:00:00.000Z") },
        rmGrnOrderAllocations: [{
          allocated_quantity: 20,
          verificationAllocation: {
            verification: {
              organization_id: "internal-org-1",
              created_at: new Date("2026-10-03T09:00:00.000Z"),
            },
          },
        }],
      },
      {
        source_bom_item_id: "bom-fabric",
        source_order_id: "order-1",
        grouped_qty: 60,
        groupedPurchaseOrder: { created_at: new Date("2026-10-04T09:00:00.000Z") },
        rmGrnOrderAllocations: [{
          allocated_quantity: 80,
          verificationAllocation: {
            verification: {
              organization_id: "internal-org-1",
              created_at: new Date("2026-10-05T09:00:00.000Z"),
            },
          },
        }],
      },
      {
        source_bom_item_id: "bom-buttons",
        source_order_id: "order-1",
        grouped_qty: 30,
        groupedPurchaseOrder: { created_at: new Date("2026-10-04T09:00:00.000Z") },
        rmGrnOrderAllocations: [{
          allocated_quantity: 10,
          verificationAllocation: {
            verification: {
              organization_id: "internal-org-1",
              created_at: new Date("2026-10-04T12:00:00.000Z"),
            },
          },
        }, {
          allocated_quantity: 100,
          verificationAllocation: {
            verification: {
              organization_id: "another-organization",
              created_at: new Date("2026-10-06T12:00:00.000Z"),
            },
          },
        }],
      },
    ]);
    mocks.auditEventFindMany.mockResolvedValue([]);

    const rows = await listStyleHealthOrders("user-1", "public-org-1");

    expect(rows[0]?.materials).toEqual([
      {
        subCategory: "Buttons",
        poCreatedAt: "2026-10-04T09:00:00.000Z",
        orderedStatus: "PARTIAL",
        receivedStatus: "PARTIAL",
        materialReceivedAt: "2026-10-04T12:00:00.000Z",
      },
      {
        subCategory: "Fabric",
        poCreatedAt: "2026-10-04T09:00:00.000Z",
        orderedStatus: "FULL",
        receivedStatus: "FULL",
        materialReceivedAt: "2026-10-05T09:00:00.000Z",
      },
    ]);
  });

  it("shows BOM subcategories even before a grouped PO exists", async () => {
    mocks.groupedPurchaseOrderLineFindMany.mockResolvedValue([]);

    const rows = await listStyleHealthOrders("user-1", "public-org-1");

    expect(rows[0]?.materials).toEqual([{
      subCategory: "Fabric",
      poCreatedAt: null,
      orderedStatus: "NOT_CREATED",
      receivedStatus: "NOT_RECEIVED",
      materialReceivedAt: null,
    }]);
  });

  it("does not query audit data when the organization has no milestone records", async () => {
    mocks.orderFindMany.mockResolvedValue([]);
    mocks.workOrderFindMany.mockResolvedValue([]);

    await expect(listStyleHealthOrders("user-1", "public-org-1")).resolves.toEqual([]);

    expect(mocks.auditEventFindMany).not.toHaveBeenCalled();
  });
});
