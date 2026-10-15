import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  assignBookingInTransaction: vi.fn(),
  allocateBookingFromGeneralStockInTransaction: vi.fn(),
  transaction: {},
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/distribution/advance-booking-service", () => ({
  assignBookingInTransaction: mocks.assignBookingInTransaction,
}));
vi.mock("@/lib/services/inventory/finished-goods-general-stock-allocation-service", () => ({
  allocateBookingFromGeneralStockInTransaction: mocks.allocateBookingFromGeneralStockInTransaction,
}));

import { allocateAdvanceBooking } from "./advance-booking-allocation-service";

describe("advance-booking combined allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) => callback(mocks.transaction),
    );
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
});
