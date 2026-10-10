import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  transaction: {
    workspaceUser: { findUnique: vi.fn() },
    workOrderInventoryGrnLine: { findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    workOrderInventoryGrnBookingAllocation: { create: vi.fn() },
    workOrderInventoryGrn: { updateMany: vi.fn() },
    masterLocation: { findFirst: vi.fn() },
    finishedGoodsGeneralStockReceipt: { create: vi.fn() },
    finishedGoodsAllocatedStockReceipt: { create: vi.fn() },
    finishedGoodsStock: { upsert: vi.fn() },
  },
  createAuditEvent: vi.fn(),
  line: {
    id: "line-1",
    grn_id: "grn-1",
    size: "M",
    buyer_size: "M",
    received_quantity: 10,
    verified_actual_quantity: null,
    grn: {
      id: "grn-1",
      grn_no: "FGRN-1",
      grn_date: new Date("2026-10-07T00:00:00.000Z"),
      status: "PENDING_VERIFICATION",
      submitted_by: "submitter-1",
      workOrder: {
        id: "work-order-1",
        work_order_no: "WO-1",
        order_id: "order-1",
        order_no: "OD-1",
        order: {
          id: "order-1",
          organization_id: "internal-org-1",
          entity_id: "entity-1",
          article: "ART-1",
          styleName: "Classic Shirt",
          brand: "Example Brand",
          buyer: "Buyer",
          category: "Garment",
          colors: "Navy",
        },
      },
    },
    workOrderSizeLine: {
      bookingAssignments: [
        {
          id: "assignment-1",
          assigned_quantity: 10,
          bookingSizeLine: { id: "booking-size-1", size: "M", booking: { id: "booking-1", booking_no: "BK-1" } },
          grnAllocations: [{ allocated_quantity: 7 }],
        },
        {
          id: "assignment-2",
          assigned_quantity: 5,
          bookingSizeLine: { id: "booking-size-2", size: "M", booking: { id: "booking-2", booking_no: "BK-2" } },
          grnAllocations: [],
        },
      ],
    },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));

import { verifyWorkOrderInventoryGrnLine } from "./work-order-grn-service";

describe("verifyWorkOrderInventoryGrnLine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.workspaceUser.findUnique.mockResolvedValue({ email: "submitter@example.test" });
    mocks.transaction.workOrderInventoryGrnLine.findFirst.mockResolvedValue(mocks.line);
    mocks.transaction.workOrderInventoryGrnLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.workOrderInventoryGrnLine.count.mockResolvedValue(0);
    mocks.transaction.masterLocation.findFirst.mockResolvedValue({
      id: "location-1",
      entity_id: "entity-1",
      entity: { is_active: true },
    });
    mocks.transaction.workOrderInventoryGrnBookingAllocation.create.mockImplementation(() =>
      Promise.resolve({ id: `grn-allocation-${mocks.transaction.workOrderInventoryGrnBookingAllocation.create.mock.calls.length}` }));
    mocks.transaction.finishedGoodsGeneralStockReceipt.create.mockImplementation(() =>
      Promise.resolve({ id: `general-receipt-${mocks.transaction.finishedGoodsGeneralStockReceipt.create.mock.calls.length}` }));
    mocks.transaction.finishedGoodsAllocatedStockReceipt.create.mockImplementation(() =>
      Promise.resolve({ id: `allocated-receipt-${mocks.transaction.finishedGoodsAllocatedStockReceipt.create.mock.calls.length}` }));
    mocks.transaction.finishedGoodsStock.upsert.mockResolvedValue({});
    mocks.transaction.workOrderInventoryGrn.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation((callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction));
  });

  it("persists the split and booking fulfillment atomically, completing the GRN when all lines are verified", async () => {
    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
      locationId: "location-1",
      actorEmail: "verifier@example.test",
    });

    expect(result).toMatchObject({
      status: "VERIFIED",
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
      rejectedQuantity: 2,
      advanceBookedQuantity: 6,
      generalInventoryQuantity: 0,
      grnCompleted: true,
    });
    expect(mocks.transaction.workOrderInventoryGrnLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "line-1",
        grn_id: "grn-1",
        grn: { organization_id: "internal-org-1" },
      },
    }));
    expect(mocks.transaction.workOrderInventoryGrnLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "line-1", grn_id: "grn-1", verified_actual_quantity: null }),
      data: {
        verified_actual_quantity: 8,
        approved_quantity: 6,
        rejected_quantity: 2,
        advance_booked_quantity: 6,
        general_inventory_quantity: 0,
      },
    }));
    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.create).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        created_by: "submitter@example.test",
        verified_by: "verifier@example.test",
        entity_id: "entity-1",
        location_id: "location-1",
        grn_no: "FGRN-1",
        work_order_no: "WO-1",
        order_no: "OD-1",
        booking_no: "BK-1",
        size: "M",
        quantity_in: 3,
        current_stock: 3,
      }),
      select: { id: true },
    }));
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ booking_no: "BK-2", quantity_in: 3 }),
      select: { id: true },
    }));
    expect(mocks.transaction.finishedGoodsStock.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.finishedGoodsStock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        quantity_on_hand: { increment: expect.anything() },
        quantity_reserved: { increment: expect.anything() },
      }),
    }));
    expect(mocks.transaction.workOrderInventoryGrn.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "grn-1", organization_id: "internal-org-1", status: "PENDING_VERIFICATION" },
      data: expect.objectContaining({ status: "VERIFIED", verified_by: "verifier-1" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
  });

  it("allows the GRN submitter to verify and post the receipt", async () => {
    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "submitter-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
      locationId: "location-1",
    });

    expect(result).toMatchObject({ status: "VERIFIED", grnCompleted: true });
    expect(mocks.transaction.workOrderInventoryGrn.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ verified_by: "submitter-1" }),
    }));
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ created_by: "submitter@example.test", verified_by: "submitter-1" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "submitter-1" }),
      mocks.transaction,
    );
  });

  it("rejects actual received quantities greater than the submitted GRN line", async () => {
    await expect(verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 11,
      approvedQuantity: 6,
    })).rejects.toThrow("cannot exceed the quantity submitted");

    expect(mocks.transaction.workOrderInventoryGrnLine.updateMany).not.toHaveBeenCalled();
  });

  it("rejects already verified lines and prevents duplicate allocation writes", async () => {
    mocks.transaction.workOrderInventoryGrnLine.findFirst.mockResolvedValue({
      ...mocks.line,
      verified_actual_quantity: 8,
    });

    await expect(verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
    })).rejects.toThrow("already been verified");

    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.create).not.toHaveBeenCalled();
  });

  it("routes approved quantity beyond remaining assignments to general inventory", async () => {
    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 10,
      approvedQuantity: 10,
      locationId: "location-1",
    });

    expect(result.advanceBookedQuantity).toBe(8);
    expect(result.generalInventoryQuantity).toBe(2);
    expect(mocks.transaction.workOrderInventoryGrnLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ advance_booked_quantity: 8, general_inventory_quantity: 2 }),
    }));
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity_in: 2, current_stock: 2 }),
    }));
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.finishedGoodsStock.upsert).toHaveBeenCalledTimes(3);
  });

  it("leaves the GRN pending while another size line still needs verification", async () => {
    mocks.transaction.workOrderInventoryGrnLine.count.mockResolvedValue(1);

    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
      locationId: "location-1",
    });

    expect(result.status).toBe("PENDING_VERIFICATION");
    expect(result.grnCompleted).toBe(false);
    expect(mocks.transaction.workOrderInventoryGrn.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a location outside the order entity before verification writes", async () => {
    mocks.transaction.masterLocation.findFirst.mockResolvedValue(null);

    await expect(verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
      locationId: "other-entity-location",
    })).rejects.toThrow("under an active order entity");

    expect(mocks.transaction.masterLocation.findFirst).toHaveBeenCalledWith({
      where: {
        id: "other-entity-location",
        organization_id: "internal-org-1",
        entity_id: "entity-1",
        is_active: true,
      },
      select: { id: true, entity_id: true, entity: { select: { is_active: true } } },
    });
    expect(mocks.transaction.workOrderInventoryGrnLine.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).not.toHaveBeenCalled();
  });

  it("verifies zero approved quantity without creating stock records", async () => {
    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 0,
    });

    expect(result).toMatchObject({ approvedQuantity: 0, generalInventoryQuantity: 0, advanceBookedQuantity: 0 });
    expect(mocks.transaction.masterLocation.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsStock.upsert).not.toHaveBeenCalled();
  });
});
