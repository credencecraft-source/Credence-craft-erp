export type BookingAssignmentBalance = {
  assignmentId: string;
  bookingNo: string;
  size: string;
  assignedQuantity: number;
  fulfilledQuantity: number;
};

export type WorkOrderGrnBookingAllocationPreview = {
  assignmentId: string;
  bookingNo: string;
  size: string;
  remainingQuantity: number;
  allocatedQuantity: number;
};

export function allocateApprovedReceiptToBookingAssignments(
  approvedQuantity: number,
  assignments: BookingAssignmentBalance[],
): {
  allocations: WorkOrderGrnBookingAllocationPreview[];
  generalInventoryQuantity: number;
} {
  if (!Number.isSafeInteger(approvedQuantity) || approvedQuantity < 0) {
    throw new Error("Approved quantity must be a whole number greater than or equal to zero.");
  }
  const seen = new Set<string>();
  const available = assignments
    .map((assignment) => {
      if (
        !assignment.assignmentId ||
        seen.has(assignment.assignmentId) ||
        !Number.isSafeInteger(assignment.assignedQuantity) ||
        !Number.isSafeInteger(assignment.fulfilledQuantity) ||
        assignment.assignedQuantity < 0 ||
        assignment.fulfilledQuantity < 0
      ) {
        throw new Error("Work-order booking assignments contain invalid quantities or duplicate IDs.");
      }
      seen.add(assignment.assignmentId);
      return {
        ...assignment,
        remainingQuantity: Math.max(assignment.assignedQuantity - assignment.fulfilledQuantity, 0),
      };
    })
    .sort((left, right) => left.bookingNo.localeCompare(right.bookingNo) || left.assignmentId.localeCompare(right.assignmentId));

  let remaining = approvedQuantity;
  const allocations = available.map((assignment) => {
    const allocatedQuantity = Math.min(remaining, assignment.remainingQuantity);
    remaining -= allocatedQuantity;
    return {
      assignmentId: assignment.assignmentId,
      bookingNo: assignment.bookingNo,
      size: assignment.size,
      remainingQuantity: assignment.remainingQuantity,
      allocatedQuantity,
    };
  });
  return { allocations, generalInventoryQuantity: remaining };
}
