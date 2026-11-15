export type WorkOrderGrnSize = {
  id: string;
  size: string | null;
  buyerSize: string | null;
  quantity: number;
};

export type WorkOrderGrnPriorLine = {
  workOrderSizeLineId: string;
  receivedQuantity: number;
  verifiedActualQuantity: number | null;
  approvedQuantity: number | null;
};

export type WorkOrderGrnLineInput = {
  workOrderSizeLineId: string;
  receivedQuantity: number;
};

export type NormalizedWorkOrderGrnLine = WorkOrderGrnLineInput & {
  size: string | null;
  buyerSize: string | null;
  orderedQuantity: number;
  availableQuantity: number;
};

export function normalizeWorkOrderGrnLines(
  sizeLines: WorkOrderGrnSize[],
  priorLines: WorkOrderGrnPriorLine[],
  requestedLines: WorkOrderGrnLineInput[],
): NormalizedWorkOrderGrnLine[] {
  if (sizeLines.length === 0) throw new Error("The selected work order has no size lines to receive.");
  if (requestedLines.length !== sizeLines.length || requestedLines.length > 200) {
    throw new Error("Submit one received quantity for every work-order size.");
  }

  const sizeById = new Map(sizeLines.map((line) => [line.id, line]));
  if (sizeById.size !== sizeLines.length) throw new Error("The selected work order contains duplicate size lines.");

  const alreadyReceivedBySize = new Map<string, number>();
  for (const line of priorLines) {
    const sizeLine = sizeById.get(line.workOrderSizeLineId);
    if (!sizeLine) throw new Error("Existing GRN history contains a size outside this work order.");
    const quantity = line.verifiedActualQuantity === null
      ? line.receivedQuantity
      : line.approvedQuantity ?? 0;
    alreadyReceivedBySize.set(
      line.workOrderSizeLineId,
      (alreadyReceivedBySize.get(line.workOrderSizeLineId) ?? 0) + quantity,
    );
  }

  const seen = new Set<string>();
  let totalReceived = 0;
  const normalized = requestedLines.map((requested) => {
    const id = requested.workOrderSizeLineId.trim();
    const source = sizeById.get(id);
    if (!source || seen.has(id)) throw new Error("Each submitted size must belong to this work order and appear only once.");
    seen.add(id);
    const quantity = requested.receivedQuantity;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
      throw new Error("Received quantities must be whole numbers greater than or equal to zero.");
    }
    const alreadyReceived = alreadyReceivedBySize.get(id) ?? 0;
    const availableQuantity = Math.max(source.quantity - alreadyReceived, 0);
    if (quantity > availableQuantity) {
      throw new Error(`Received quantity exceeds the remaining work-order balance for size ${source.size || source.buyerSize || "selected"}.`);
    }
    totalReceived += quantity;
    return {
      workOrderSizeLineId: id,
      receivedQuantity: quantity,
      size: source.size,
      buyerSize: source.buyerSize,
      orderedQuantity: source.quantity,
      availableQuantity,
    };
  });

  if (seen.size !== sizeById.size) throw new Error("Submit one received quantity for every work-order size.");
  if (totalReceived <= 0) throw new Error("Enter a received quantity for at least one work-order size.");
  return normalized;
}

export type WorkOrderGrnVerificationSplit = {
  rejectedQuantity: number;
  generalInventoryQuantity: number;
};

export function calculateWorkOrderGrnVerificationSplit(input: {
  actualReceivedQuantity: number;
  approvedQuantity: number;
  advanceBookedQuantity: number;
}): WorkOrderGrnVerificationSplit {
  const { actualReceivedQuantity, approvedQuantity, advanceBookedQuantity } = input;
  if (
    !Number.isSafeInteger(actualReceivedQuantity) ||
    !Number.isSafeInteger(approvedQuantity) ||
    !Number.isSafeInteger(advanceBookedQuantity) ||
    actualReceivedQuantity < 0 ||
    approvedQuantity < 0 ||
    advanceBookedQuantity < 0
  ) {
    throw new Error("Verification quantities must be whole numbers greater than or equal to zero.");
  }
  if (approvedQuantity > actualReceivedQuantity) {
    throw new Error("Approved quantity cannot exceed actual received quantity.");
  }
  if (advanceBookedQuantity > approvedQuantity) {
    throw new Error("Advance-booked quantity cannot exceed approved quantity.");
  }
  return {
    rejectedQuantity: actualReceivedQuantity - approvedQuantity,
    generalInventoryQuantity: approvedQuantity - advanceBookedQuantity,
  };
}
