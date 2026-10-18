import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    finishedGoodsGeneralStockReceipt: { findMany: vi.fn(), groupBy: vi.fn() },
  },
  transaction: {
    advanceBooking: { findFirst: vi.fn(), findMany: vi.fn() },
    masterSizeGroup: { findMany: vi.fn() },
    masterSizeGroupSize: { findMany: vi.fn() },
    masterArticle: { findFirst: vi.fn(), findMany: vi.fn() },
    finishedGoodsGeneralStockReceipt: { findMany: vi.fn(), updateMany: vi.fn() },
    advanceBookingWorkOrderAssignment: { create: vi.fn(), updateMany: vi.fn() },
    workOrderInventoryGrnBookingAllocation: { create: vi.fn(), updateMany: vi.fn() },
    finishedGoodsAllocatedStockReceipt: { create: vi.fn(), updateMany: vi.fn() },
    finishedGoodsStock: { upsert: vi.fn() },
  },
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));

import {
  allocateAdvanceBookingFromGeneralStock,
  allocateBookingFromGeneralStockInTransaction,
  listGeneralFinishedGoodsAvailability,
  loadGeneralStockAllocationContext,
} from "./finished-goods-general-stock-allocation-service";

const bookingRecord = {
  id: "booking-1",
  booking_no: "BK-1",
  order_id: "order-1",
  order: { sourceStatus: "ARTICLE_BASED" },
  quotationLines: [{ quotation: { parentQuotation: { id: "sales-order-1" } } }],
  sizeLines: [{
    id: "booking-size-1",
    size: "M",
    booked_quantity: 10,
    assignments: [],
  }],
};

const generalStockReceipt = {
  id: "general-receipt-1",
  organization_id: "organization-1",
  entity_id: "entity-1",
  location_id: "location-1",
  grn_id: "grn-1",
  grn_line_id: "grn-line-1",
  work_order_id: "work-order-1",
  order_id: "order-1",
  grn_no: "GRN-1",
  grn_date: new Date("2026-10-01T00:00:00.000Z"),
  work_order_no: "WO-1",
  order_no: "ORD-1",
  article_no: "ART-1",
  style_name: "Style 1",
  brand: "Brand",
  buyer: "Buyer",
  product_category: "Shirt",
  colour: "Blue",
  size: "M",
  buyer_size: "M",
  received_quantity: 10,
  actual_received_quantity: 10,
  approved_quantity: 10,
  rejected_quantity: 0,
  quantity_in: 8,
  quantity_out: 0,
  current_stock: 8,
  created_by: "factory@example.test",
  verified_by: "inventory@example.test",
  posted_at: new Date("2026-10-02T00:00:00.000Z"),
  created_at: new Date("2026-10-02T00:00:00.000Z"),
  grnLine: {
    workOrderSizeLine: {
      id: "work-order-size-1",
      work_order_id: "work-order-1",
      quantity: 20,
      bookingAssignments: [],
    },
    bookingAllocations: [],
  },
};

describe("finished-goods general-stock allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) => callback(mocks.transaction),
    );
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue(structuredClone(bookingRecord));
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([]);
    mocks.transaction.masterArticle.findFirst.mockResolvedValue(null);
    mocks.transaction.masterArticle.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([
      structuredClone(generalStockReceipt),
    ]);
    mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.advanceBookingWorkOrderAssignment.create.mockResolvedValue({ id: "assignment-1" });
    mocks.transaction.advanceBookingWorkOrderAssignment.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.workOrderInventoryGrnBookingAllocation.create.mockResolvedValue({ id: "grn-allocation-1" });
    mocks.transaction.workOrderInventoryGrnBookingAllocation.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsAllocatedStockReceipt.create.mockResolvedValue({ id: "allocated-receipt-1" });
    mocks.transaction.finishedGoodsAllocatedStockReceipt.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsStock.upsert.mockResolvedValue({});
  });

  it("moves available size-matched stock into allocated inventory and creates the work-order assignment", async () => {
    const result = await allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 8 }],
    );

    expect(result).toEqual({
      bookingId: "booking-1",
      bookingNo: "BK-1",
      allocatedLines: [{ size: "M", quantity: 8 }],
    });

    expect(mocks.transaction.advanceBookingWorkOrderAssignment.create).toHaveBeenCalledWith({
      data: {
        organization_id: "organization-1",
        booking_size_line_id: "booking-size-1",
        work_order_id: "work-order-1",
        work_order_size_line_id: "work-order-size-1",
        assigned_quantity: 8,
        created_by: "user-1",
      },
      select: { id: true },
    });
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: "general-receipt-1", organization_id: "organization-1", current_stock: 8 },
      data: { quantity_out: { increment: 8 }, current_stock: { decrement: 8 } },
    });
    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.create).toHaveBeenCalledWith({
      data: {
        organization_id: "organization-1",
        grn_line_id: "grn-line-1",
        booking_assignment_id: "assignment-1",
        allocated_quantity: 8,
        created_by: "user-1",
      },
      select: { id: true },
    });
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        booking_id: "booking-1",
        booking_size_line_id: "booking-size-1",
        booking_assignment_id: "assignment-1",
        grn_allocation_id: "grn-allocation-1",
        quantity_in: 8,
        current_stock: 8,
      }),
      select: { id: true },
    });
    expect(mocks.transaction.finishedGoodsStock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { quantity_reserved: { increment: new Prisma.Decimal(8) } },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "ALLOCATE_GENERAL_FINISHED_GOODS_TO_BOOKING",
      entityId: "booking-1",
    }), mocks.transaction);
  });

  it("automatically moves all matching available General Stock into booking-allocated stock", async () => {
    const result = await allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [],
    );

    expect(result.allocatedLines).toEqual([{ size: "M", quantity: 8 }]);
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: "general-receipt-1", organization_id: "organization-1", current_stock: 8 },
      data: { quantity_out: { increment: 8 }, current_stock: { decrement: 8 } },
    });
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        booking_id: "booking-1",
        quantity_in: 8,
        current_stock: 8,
      }),
    }));
  });

  it("returns allocated sizes in their Size Group order", async () => {
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue({
      ...structuredClone(bookingRecord),
      order: { sourceStatus: "ARTICLE_BASED", sizeGroup: "group-1" },
      sizeLines: ["M", "S"].map((size) => ({
        id: `booking-size-${size}`,
        size,
        booked_quantity: 10,
        assignments: [],
      })),
    });

    mocks.transaction.masterSizeGroup.findMany.mockResolvedValue([{
      id: "group-id",
      value_id: "group-value-id",
      size_group: "group-1",
      size_links: ["S", "M"].map((size) => ({
        size_group_id: "group-id",
        size: { organization_id: "organization-1", size },
      })),
    }]);
    mocks.transaction.masterSizeGroupSize.findMany.mockResolvedValue(["S", "M"].map((size) => ({
      size_group_id: "group-id",
      size: { organization_id: "organization-1", size },
    })));
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue(
      ["M", "S"].map((size) => ({
        ...structuredClone(generalStockReceipt),
        id: `general-receipt-${size}`,
        grn_line_id: `grn-line-${size}`,
        size,
        grnLine: {
          ...structuredClone(generalStockReceipt.grnLine),
          workOrderSizeLine: {
            ...structuredClone(generalStockReceipt.grnLine.workOrderSizeLine),
            id: `work-order-size-${size}`,
          },
        },
      })),
    );

    const result = await allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      ["M", "S"].map((size) => ({ bookingSizeLineId: `booking-size-${size}`, quantity: 1 })),
    );

    expect(result.allocatedLines.map(({ size }) => size)).toEqual(["S", "M"]);
  });

  it("loads general-stock receipts once and groups them by authorized source order", async () => {
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([
      structuredClone(generalStockReceipt),
    ]);
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([
      {
        ...structuredClone(bookingRecord),
        order: { sourceStatus: "ARTICLE_BASED", article: null, sizeGroup: null },
        quotationLines: [{ quotation: { parentQuotation: { id: "sales-order-1" } } }],
      },
      {
        ...structuredClone(bookingRecord),
        id: "booking-2",
        order_id: "order-2",
        order: { sourceStatus: "ARTICLE_BASED", article: null, sizeGroup: null },
        quotationLines: [{ quotation: { parentQuotation: { id: "sales-order-1" } } }],
      },
    ]);

    const context = await loadGeneralStockAllocationContext(
      mocks.transaction as never,
      "organization-1",
      ["booking-1", "booking-2", "booking-1"],
    );

    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "organization-1",
        order_id: { in: ["order-1", "order-2"] },
        current_stock: { gt: 0 },
      },
      orderBy: [{ posted_at: "asc" }, { id: "asc" }],
    }));
    expect(context.receiptsByOrderId.get("order-1")).toHaveLength(1);
    expect(context.receiptsByOrderId.get("order-2")).toEqual([]);
    expect(mocks.transaction.advanceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["booking-1", "booking-2"] }, organization_id: "organization-1" },
      select: expect.objectContaining({
        sizeLines: expect.objectContaining({
          select: expect.objectContaining({
            assignments: expect.objectContaining({
              where: { organization_id: "organization-1" },
            }),
          }),
        }),
      }),
    }));
    expect(context.bookingById.has("booking-1")).toBe(true);
    expect(context.bookingById.has("booking-2")).toBe(true);
  });

  it("reuses preloaded booking and stock state during a Sales Order general-stock allocation", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      ...structuredClone(bookingRecord),
      order: { sourceStatus: "ARTICLE_BASED", article: null, sizeGroup: null },
      quotationLines: [{ quotation: { parentQuotation: { id: "sales-order-1" } } }],
    }]);
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([
      structuredClone(generalStockReceipt),
    ]);

    const context = await loadGeneralStockAllocationContext(
      mocks.transaction as never,
      "organization-1",
      ["booking-1"],
    );
    const result = await allocateBookingFromGeneralStockInTransaction(
      mocks.transaction as never,
      "organization-1",
      "user-1",
      "booking-1",
      [],
      context,
    );

    expect(result.allocatedLines).toEqual([{ size: "M", quantity: 8 }]);
    expect(mocks.transaction.advanceBooking.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.advanceBooking.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).toHaveBeenCalledTimes(1);
  });

  it("rejects general-stock allocation for Direct orders before reading or moving stock", async () => {
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue({
      ...structuredClone(bookingRecord),
      order: { sourceStatus: "DIRECT" },
    });

    await expect(allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 1 }],
    )).rejects.toThrow("General stock can only be allocated to bookings from Article-based orders.");

    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("allows legacy Article-based orders with a matching organization Article master record", async () => {
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue({
      ...structuredClone(bookingRecord),
      order: { sourceStatus: "DIRECT", article: "Oxford Shirt" },
    });
    mocks.transaction.masterArticle.findFirst.mockResolvedValue({ id: "master-article-1" });

    await expect(allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 1 }],
    )).resolves.toMatchObject({
      allocatedLines: [{ size: "M", quantity: 1 }],
    });

    expect(mocks.transaction.masterArticle.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "organization-1", article: "Oxford Shirt" },
      select: { id: true },
    });
  });

  it("allocates only the size quantity requested by the user", async () => {
    const result = await allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 3 }],
    );

    expect(result.allocatedLines).toEqual([{ size: "M", quantity: 3 }]);
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assigned_quantity: 3 }),
    }));
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: "general-receipt-1", organization_id: "organization-1", current_stock: 8 },
      data: { quantity_out: { increment: 3 }, current_stock: { decrement: 3 } },
    });
    expect(mocks.transaction.finishedGoodsStock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { quantity_reserved: { increment: new Prisma.Decimal(3) } },
    }));
  });

  it("allocates matching receipts in FIFO order without scanning unrelated sizes", async () => {
    const firstReceipt = structuredClone(generalStockReceipt);
    firstReceipt.current_stock = 3;
    const secondReceipt = structuredClone(generalStockReceipt);
    secondReceipt.id = "general-receipt-2";
    secondReceipt.grn_line_id = "grn-line-2";
    secondReceipt.current_stock = 5;
    secondReceipt.grnLine.bookingAllocations = [];
    const otherSizeReceipt = structuredClone(generalStockReceipt);
    otherSizeReceipt.id = "general-receipt-s";
    otherSizeReceipt.size = "S";
    otherSizeReceipt.current_stock = 10;
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([
      firstReceipt,
      secondReceipt,
      otherSizeReceipt,
    ]);

    const result = await allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 7 }],
    );

    expect(result.allocatedLines).toEqual([{ size: "M", quantity: 7 }]);
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "general-receipt-1", organization_id: "organization-1", current_stock: 3 },
      data: { quantity_out: { increment: 3 }, current_stock: { decrement: 3 } },
    });
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "general-receipt-2", organization_id: "organization-1", current_stock: 5 },
      data: { quantity_out: { increment: 4 }, current_stock: { decrement: 4 } },
    });
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenCalledTimes(2);
  });

  it("caps allocation at the remaining booking and work-order size balances", async () => {
    const receipt = structuredClone(generalStockReceipt);
    receipt.current_stock = 15;
    receipt.grnLine.workOrderSizeLine.quantity = 6;
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([receipt]);

    await allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 6 }],
    );

    expect(mocks.transaction.advanceBookingWorkOrderAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assigned_quantity: 6 }),
    }));
    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ allocated_quantity: 6 }),
    }));
  });

  it("uses a matching existing assignment's unfulfilled balance before extending it", async () => {
    const existingAssignment = {
      id: "assignment-1",
      work_order_id: "work-order-1",
      work_order_size_line_id: "work-order-size-1",
      assigned_quantity: 4,
      grnAllocations: [{ allocated_quantity: 2 }],
    };
    const booking = {
      ...structuredClone(bookingRecord),
      sizeLines: [{
        ...structuredClone(bookingRecord.sizeLines[0]),
        assignments: [existingAssignment],
      }],
    };
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue(booking);
    const receipt = {
      ...structuredClone(generalStockReceipt),
      grnLine: {
        ...structuredClone(generalStockReceipt.grnLine),
        workOrderSizeLine: {
          ...structuredClone(generalStockReceipt.grnLine.workOrderSizeLine),
          quantity: 10,
          bookingAssignments: [{
            id: "assignment-1",
            booking_size_line_id: "booking-size-1",
            assigned_quantity: 4,
          }],
        },
        bookingAllocations: [{
          id: "grn-allocation-existing",
          booking_assignment_id: "assignment-1",
          allocated_quantity: 2,
          finishedGoodsStockReceipt: { id: "allocated-receipt-existing", current_stock: 2 },
        }],
      },
    };
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([receipt]);

    await allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 8 }],
    );

    expect(mocks.transaction.advanceBookingWorkOrderAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: "assignment-1", organization_id: "organization-1" },
      data: { assigned_quantity: { increment: 6 } },
    });
    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.create).not.toHaveBeenCalled();
    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "grn-allocation-existing",
        organization_id: "organization-1",
        allocated_quantity: 2,
      },
      data: { allocated_quantity: { increment: 8 } },
    });
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.updateMany).toHaveBeenCalledWith({
      where: {
        id: "allocated-receipt-existing",
        organization_id: "organization-1",
        current_stock: 2,
      },
      data: {
        quantity_in: { increment: 8 },
        current_stock: { increment: 8 },
      },
    });
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.create).not.toHaveBeenCalled();
  });

  it("does not assign general stock beyond a booking's existing assignment balance", async () => {
    const booking = {
      ...structuredClone(bookingRecord),
      sizeLines: [{
        ...structuredClone(bookingRecord.sizeLines[0]),
        assignments: [{
          id: "other-work-order-assignment",
          work_order_id: "other-work-order",
          work_order_size_line_id: "other-work-order-size",
          assigned_quantity: 10,
          grnAllocations: [],
        }],
      }],
    };
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue(booking);
    const receipt = structuredClone(generalStockReceipt);
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([receipt]);
    receipt.grnLine.workOrderSizeLine.quantity = 20;

    await expect(allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 5 }],
    ))
      .rejects.toThrow("exceeds its available stock or unassigned balance");

    expect(mocks.transaction.advanceBookingWorkOrderAssignment.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("requires a sales order and does not mutate inventory before that stage", async () => {
    const booking = {
      ...structuredClone(bookingRecord),
      quotationLines: [{ quotation: { parentQuotation: null } }],
    };
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue(booking);

    await expect(allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 8 }],
    ))
      .rejects.toThrow("Create a Sales Order");

    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a size line outside the organization-scoped booking", async () => {
    await expect(allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "another-booking-size", quantity: 1 }],
    )).rejects.toThrow("do not belong to this advance booking");

    expect(mocks.transaction.advanceBooking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "booking-1", organization_id: "organization-1" },
    }));
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("rejects duplicate size requests before opening a transaction", async () => {
    await expect(allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [
        { bookingSizeLineId: "booking-size-1", quantity: 2 },
        { bookingSizeLineId: "booking-size-1", quantity: 3 },
      ],
    )).rejects.toThrow("unique booking size");

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a request above allocatable stock instead of silently allocating a smaller quantity", async () => {
    await expect(allocateAdvanceBookingFromGeneralStock(
      "organization-1",
      "user-1",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 9 }],
    )).rejects.toThrow("exceeds its available stock or unassigned balance");

    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("does not expose another organization's general-stock balances", async () => {
    mocks.prisma.finishedGoodsGeneralStockReceipt.groupBy.mockResolvedValue([{
      order_id: "order-1",
      size: "M",
      _sum: { current_stock: 5 },
    }]);

    const result = await listGeneralFinishedGoodsAvailability("organization-1", ["order-1", "order-1"]);

    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.groupBy).toHaveBeenCalledWith({
      where: {
        organization_id: "organization-1",
        order_id: { in: ["order-1"] },
        current_stock: { gt: 0 },
      },
      by: ["order_id", "size"],
      _sum: { current_stock: true },
    });
    expect(result.get("order-1")?.get("M")).toBe(5);
  });
});
