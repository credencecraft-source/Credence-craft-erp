import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import {
  assignBookingInTransaction,
  type AdvanceBookingAssignmentInput,
} from "@/lib/services/distribution/advance-booking-service";
import {
  allocateBookingFromGeneralStockInTransaction,
  type GeneralStockAllocationLineInput,
} from "@/lib/services/inventory/finished-goods-general-stock-allocation-service";

type Database = Prisma.TransactionClient;

export type AdvanceBookingAllocationInput = {
  workOrderId: string;
  generalStockLines: GeneralStockAllocationLineInput[];
  workOrderLines: AdvanceBookingAssignmentInput[];
};

function validateLines(
  lines: Array<{ bookingSizeLineId: string; quantity: number }>,
  label: string,
) {
  const seen = new Set<string>();
  for (const line of lines) {
    const bookingSizeLineId = line?.bookingSizeLineId?.trim();
    if (
      !bookingSizeLineId ||
      seen.has(bookingSizeLineId) ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > 2147483647
    ) {
      throw new Error(`Each ${label} line needs a unique size and a positive whole-number quantity.`);
    }
    seen.add(bookingSizeLineId);
  }
}

async function allocateBookingInTransaction(
  transaction: Database,
  organizationId: string,
  userId: string,
  bookingId: string,
  input: AdvanceBookingAllocationInput,
) {
  const generalStock = input.generalStockLines.length > 0
    ? await allocateBookingFromGeneralStockInTransaction(
        transaction,
        organizationId,
        userId,
        bookingId,
        input.generalStockLines,
      )
    : null;
  const workOrder = input.workOrderLines.length > 0
    ? await assignBookingInTransaction(
        transaction,
        organizationId,
        userId,
        bookingId,
        { workOrderId: input.workOrderId, lines: input.workOrderLines },
      )
    : null;

  return { bookingId, generalStock, workOrder };
}

export async function allocateAdvanceBooking(
  organizationId: string,
  userId: string,
  bookingId: string,
  input: AdvanceBookingAllocationInput,
) {
  if (!organizationId.trim() || !userId.trim() || !bookingId.trim()) {
    throw new Error("A valid organization, actor, and advance booking are required.");
  }
  if (
    !Array.isArray(input.generalStockLines) ||
    !Array.isArray(input.workOrderLines) ||
    input.generalStockLines.length > 200 ||
    input.workOrderLines.length > 200
  ) {
    throw new Error("Submit valid size-wise quantities for this allocation.");
  }
  if (input.generalStockLines.length === 0 && input.workOrderLines.length === 0) {
    throw new Error("Enter a general-stock or work-order quantity before saving.");
  }
  validateLines(input.generalStockLines, "general-stock allocation");
  validateLines(input.workOrderLines.map((line) => ({
    bookingSizeLineId: line.bookingSizeLineId,
    quantity: line.assignedQuantity,
  })), "work-order assignment");
  if (input.workOrderLines.length > 0 && !input.workOrderId.trim()) {
    throw new Error("Select a work order before assigning the remaining booking quantity.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => allocateBookingInTransaction(
          transaction,
          organizationId,
          userId,
          bookingId,
          input,
        ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("Booking or inventory balances changed concurrently. Reload and try again.");
}
