import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    distributionQuotation: { findFirst: vi.fn() },
    advanceBooking: { findMany: vi.fn() },
    factoryWorkOrder: { findMany: vi.fn() },
  },
  assignBookingInTransaction: vi.fn(),
  allocateBookingFromGeneralStockInTransaction: vi.fn(),
  listGeneralFinishedGoodsAvailability: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  transaction: {
    distributionQuotation: { findFirst: vi.fn() },
    advanceBooking: { findMany: vi.fn() },
    factoryWorkOrder: { findMany: vi.fn() },
    masterArticle: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/distribution/advance-booking-service", () => ({
  assignBookingInTransaction: mocks.assignBookingInTransaction,
}));
vi.mock("@/lib/services/inventory/finished-goods-general-stock-allocation-service", () => ({
  allocateBookingFromGeneralStockInTransaction: mocks.allocateBookingFromGeneralStockInTransaction,
  listGeneralFinishedGoodsAvailability: mocks.listGeneralFinishedGoodsAvailability,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationAccess: mocks.requireOrganizationAccess,
}));

import {
  allocateAdvanceBooking,
  allocateSalesOrder,
  getSalesOrderAllocationData,
} from "./advance-booking-allocation-service";

const salesOrderBookings = [
  {
    id: "booking-1",
    order_id: "order-1",
    order: { id: "order-1", orderNo: "ORD-1", sourceStatus: "ARTICLE_BASED", article: null },
    sizeLines: [{
      id: "size-m-1",
      size: "M",
      booked_quantity: 5,
      assignments: [{ assigned_quantity: 2, grnAllocations: [] }],
    }],
  },
  {
    id: "booking-2",
    order_id: "order-1",
    order: { id: "order-1", orderNo: "ORD-1", sourceStatus: "ARTICLE_BASED", article: null },
    sizeLines: [{
      id: "size-m-2",
      size: "M",
      booked_quantity: 7,
      assignments: [{ assigned_quantity: 1, grnAllocations: [] }],
    }],
  },
];

const salesOrderWorkOrders = [{
  id: "work-order-1",
  order_id: "order-1",
  work_order_no: "WO-1",
  status: "OPEN",
  created_at: new Date("2026-10-01T00:00:00.000Z"),
  sizeLines: [{
    id: "work-order-size-m",
    size: "M",
    buyer_size: "M",
    quantity: 20,
    bookingAssignments: [{ assigned_quantity: 4 }],
  }],
}];

describe("advance-booking combined allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) => callback(mocks.transaction),
    );
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValue({
      id: "sales-order-1",
      quotation_no: "SO-1",
    });
    mocks.prisma.advanceBooking.findMany.mockResolvedValue(structuredClone(salesOrderBookings));
    mocks.prisma.factoryWorkOrder.findMany.mockResolvedValue(structuredClone(salesOrderWorkOrders));
    mocks.transaction.distributionQuotation.findFirst.mockResolvedValue({
      id: "sales-order-1",
      quotation_no: "SO-1",
    });
    mocks.transaction.advanceBooking.findMany.mockResolvedValue(structuredClone(salesOrderBookings));
    mocks.transaction.factoryWorkOrder.findMany.mockResolvedValue(structuredClone(salesOrderWorkOrders));
    mocks.transaction.masterArticle.findMany.mockResolvedValue([]);
    mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "organization-1" });
    mocks.listGeneralFinishedGoodsAvailability.mockResolvedValue(new Map([
      ["order-1", new Map([["M", 3]])],
    ]));
    mocks.allocateBookingFromGeneralStockInTransaction.mockResolvedValue({
      allocatedLines: [{ size: "M", quantity: 100 }],
    });
    mocks.assignBookingInTransaction.mockResolvedValue({ workOrderId: "work-order-1" });
  });

  it("allocates stock and assigns the remainder in the same transaction", async () => {
    const result = await allocateAdvanceBooking("organization-1", "user-1", "booking-1", {
      workOrderId: "work-order-1",
      generalStockLines: [{ bookingSizeLineId: "size-m", quantity: 100 }],
      workOrderLines: [{ bookingSizeLineId: "size-m", assignedQuantity: 100 }],
    });

    expect(result).toEqual({
      bookingId: "booking-1",
      generalStock: { allocatedLines: [{ size: "M", quantity: 100 }] },
      workOrder: { workOrderId: "work-order-1" },
    });
    expect(mocks.allocateBookingFromGeneralStockInTransaction).toHaveBeenCalledWith(
      mocks.transaction,
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "size-m", quantity: 100 }],
    );
    expect(mocks.assignBookingInTransaction).toHaveBeenCalledWith(
      mocks.transaction,
      "organization-1",
      "user-1",
      "booking-1",
      {
        workOrderId: "work-order-1",
        lines: [{ bookingSizeLineId: "size-m", assignedQuantity: 100 }],
      },
    );
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: "Serializable",
    }));
  });

  it("allows allocation from stock without requiring work-order lines", async () => {
    await allocateAdvanceBooking("organization-1", "user-1", "booking-1", {
      workOrderId: "",
      generalStockLines: [{ bookingSizeLineId: "size-m", quantity: 100 }],
      workOrderLines: [],
    });

    expect(mocks.allocateBookingFromGeneralStockInTransaction).toHaveBeenCalledOnce();
    expect(mocks.assignBookingInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a work-order remainder without a selected work order", async () => {
    await expect(allocateAdvanceBooking("organization-1", "user-1", "booking-1", {
      workOrderId: "",
      generalStockLines: [{ bookingSizeLineId: "size-m", quantity: 100 }],
      workOrderLines: [{ bookingSizeLineId: "size-m", assignedQuantity: 100 }],
    })).rejects.toThrow("Select a work order");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a split allocation with no positive quantities", async () => {
    await expect(allocateAdvanceBooking("organization-1", "user-1", "booking-1", {
      workOrderId: "",
      generalStockLines: [],
      workOrderLines: [],
    })).rejects.toThrow("Enter a general-stock or work-order quantity");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("groups same-order bookings and combines size balances for the Sales Order popup", async () => {
    const result = await getSalesOrderAllocationData("organization-1", "sales-order-1");

    expect(result.salesOrderNo).toBe("SO-1");
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      orderNo: "ORD-1",
      bookingCount: 2,
      totalBooked: 12,
      totalUnassigned: 9,
      totalGeneralStock: 3,
      sizes: [{
        size: "M",
        bookedQuantity: 12,
        assignedQuantity: 3,
        unassignedQuantity: 9,
        generalStockQuantity: 3,
      }],
      selectedWorkOrderId: "work-order-1",
    });
    expect(mocks.prisma.advanceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "organization-1",
        quotationLines: expect.any(Object),
      }),
    }));
  });

  it("allocates general stock across all linked bookings in one transaction", async () => {
    mocks.allocateBookingFromGeneralStockInTransaction.mockResolvedValue({
      allocatedLines: [{ size: "M", quantity: 3 }],
    });

    const result = await allocateSalesOrder("user-1", "public-org", "sales-order-1", "GENERAL");

    expect(result).toEqual({
      mode: "GENERAL",
      allocatedBookings: 2,
      allocatedOrders: 1,
      allocatedQuantity: 6,
    });
    expect(mocks.allocateBookingFromGeneralStockInTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.allocateBookingFromGeneralStockInTransaction).toHaveBeenNthCalledWith(
      1,
      mocks.transaction,
      "organization-1",
      "user-1",
      "booking-1",
      [],
    );
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: "Serializable",
    }));
  });

  it("bulk assigns remaining booking quantities to the selected source-order work order", async () => {
    const result = await allocateSalesOrder(
      "user-1",
      "public-org",
      "sales-order-1",
      "PRODUCTION",
      [{ orderId: "order-1", workOrderId: "work-order-1" }],
    );

    expect(result).toEqual({
      mode: "PRODUCTION",
      allocatedBookings: 2,
      allocatedOrders: 1,
      allocatedQuantity: 9,
    });
    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.assignBookingInTransaction).toHaveBeenNthCalledWith(
      1,
      mocks.transaction,
      "organization-1",
      "user-1",
      "booking-1",
      {
        workOrderId: "work-order-1",
        lines: [{ bookingSizeLineId: "size-m-1", assignedQuantity: 3 }],
      },
    );
    expect(mocks.assignBookingInTransaction).toHaveBeenNthCalledWith(
      2,
      mocks.transaction,
      "organization-1",
      "user-1",
      "booking-2",
      {
        workOrderId: "work-order-1",
        lines: [{ bookingSizeLineId: "size-m-2", assignedQuantity: 6 }],
      },
    );
  });

  it("rejects a selected work order with insufficient size capacity before assigning", async () => {
    mocks.transaction.factoryWorkOrder.findMany.mockResolvedValue([{
      ...structuredClone(salesOrderWorkOrders[0]),
      sizeLines: [{
        ...structuredClone(salesOrderWorkOrders[0].sizeLines[0]),
        quantity: 6,
        bookingAssignments: [{ assigned_quantity: 4 }],
      }],
    }]);

    await expect(allocateSalesOrder(
      "user-1",
      "public-org",
      "sales-order-1",
      "PRODUCTION",
      [{ orderId: "order-1", workOrderId: "work-order-1" }],
    )).rejects.toThrow("needs 9. Select another work order");

    expect(mocks.assignBookingInTransaction).not.toHaveBeenCalled();
  });
});
