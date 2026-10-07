import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  transaction: {
    workOrderInventoryGrnLine: { findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    workOrderInventoryGrnBookingAllocation: { createMany: vi.fn() },
    workOrderInventoryGrn: { updateMany: vi.fn() },
  },
  createAuditEvent: vi.fn(),
  line: {
    id: "line-1",
    grn_id: "grn-1",
    size: "M",
    buyer_size: "M",
    received_quantity: 10,
    verified_actual_quantity: null,
    grn: { id: "grn-1", grn_no: "FGRN-1", status: "PENDING_VERIFICATION", submitted_by: "submitter-1" },
    workOrderSizeLine: {
      bookingAssignments: [
        {
          id: "assignment-1",
          assigned_quantity: 10,
          bookingSizeLine: { size: "M", booking: { booking_no: "BK-1" } },
          grnAllocations: [{ allocated_quantity: 7 }],
        },
        {
          id: "assignment-2",
          assigned_quantity: 5,
          bookingSizeLine: { size: "M", booking: { booking_no: "BK-2" } },
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
    mocks.transaction.workOrderInventoryGrnLine.findFirst.mockResolvedValue(mocks.line);
    mocks.transaction.workOrderInventoryGrnLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.workOrderInventoryGrnLine.count.mockResolvedValue(0);
    mocks.transaction.workOrderInventoryGrnBookingAllocation.createMany.mockResolvedValue({ count: 2 });
    mocks.transaction.workOrderInventoryGrn.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation((callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction));
  });

  it("persists the split and booking fulfillment atomically, completing the GRN when all lines are verified", async () => {
    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
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
    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.createMany).toHaveBeenCalledWith({
      data: [
        { organization_id: "internal-org-1", grn_line_id: "line-1", booking_assignment_id: "assignment-1", allocated_quantity: 3, created_by: "verifier-1" },
        { organization_id: "internal-org-1", grn_line_id: "line-1", booking_assignment_id: "assignment-2", allocated_quantity: 3, created_by: "verifier-1" },
      ],
    });
    expect(mocks.transaction.workOrderInventoryGrn.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "grn-1", organization_id: "internal-org-1", status: "PENDING_VERIFICATION" },
      data: expect.objectContaining({ status: "VERIFIED", verified_by: "verifier-1" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
  });

  it("rejects verifying a GRN line created by the same user", async () => {
    await expect(verifyWorkOrderInventoryGrnLine("internal-org-1", "submitter-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
    })).rejects.toThrow("cannot verify it");

    expect(mocks.transaction.workOrderInventoryGrnLine.updateMany).not.toHaveBeenCalled();
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

    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.createMany).not.toHaveBeenCalled();
  });

  it("routes approved quantity beyond remaining assignments to general inventory", async () => {
    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 10,
      approvedQuantity: 10,
    });

    expect(result.advanceBookedQuantity).toBe(8);
    expect(result.generalInventoryQuantity).toBe(2);
    expect(mocks.transaction.workOrderInventoryGrnLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ advance_booked_quantity: 8, general_inventory_quantity: 2 }),
    }));
  });

  it("leaves the GRN pending while another size line still needs verification", async () => {
    mocks.transaction.workOrderInventoryGrnLine.count.mockResolvedValue(1);

    const result = await verifyWorkOrderInventoryGrnLine("internal-org-1", "verifier-1", "grn-1", "line-1", {
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
    });

    expect(result.status).toBe("PENDING_VERIFICATION");
    expect(result.grnCompleted).toBe(false);
    expect(mocks.transaction.workOrderInventoryGrn.updateMany).not.toHaveBeenCalled();
  });
});
