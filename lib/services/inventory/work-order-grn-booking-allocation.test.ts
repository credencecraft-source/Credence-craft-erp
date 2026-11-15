import { describe, expect, it } from "vitest";

import { allocateApprovedReceiptToBookingAssignments } from "./work-order-grn-booking-allocation";

describe("allocateApprovedReceiptToBookingAssignments", () => {
  it("allocates approved quantity only to assignments for the same work-order size", () => {
    const result = allocateApprovedReceiptToBookingAssignments(12, [
      { assignmentId: "a-2", bookingNo: "BK-2", size: "M", assignedQuantity: 8, fulfilledQuantity: 3 },
      { assignmentId: "a-1", bookingNo: "BK-1", size: "M", assignedQuantity: 10, fulfilledQuantity: 0 },
    ]);

    expect(result.allocations).toEqual([
      { assignmentId: "a-1", bookingNo: "BK-1", size: "M", remainingQuantity: 10, allocatedQuantity: 10 },
      { assignmentId: "a-2", bookingNo: "BK-2", size: "M", remainingQuantity: 5, allocatedQuantity: 2 },
    ]);
    expect(result.generalInventoryQuantity).toBe(0);
  });

  it("routes the quantity above unfulfilled booking demand to general inventory", () => {
    const result = allocateApprovedReceiptToBookingAssignments(8, [
      { assignmentId: "a-1", bookingNo: "BK-1", size: "M", assignedQuantity: 4, fulfilledQuantity: 4 },
    ]);

    expect(result.allocations[0].allocatedQuantity).toBe(0);
    expect(result.generalInventoryQuantity).toBe(8);
  });
});
