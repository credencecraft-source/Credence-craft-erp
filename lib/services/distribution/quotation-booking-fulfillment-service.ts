import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

type Database = Prisma.TransactionClient;

const quotationBookingInclude = {
  sizeLines: {
    include: {
      assignments: {
        include: {
          grnAllocations: {
            include: {
              grnLine: {
                select: {
                  id: true,
                  advance_booked_quantity: true,
                  grn: { select: { grn_no: true } },
                },
              },
              finishedGoodsStockReceipt: {
                select: {
                  id: true,
                  entity_id: true,
                  location_id: true,
                  style_name: true,
                  size: true,
                  quantity_in: true,
                  current_stock: true,
                  quantity_out: true,
                },
              },
            },
          },
          finishedGoodsStockReceipts: { select: { id: true } },
        },
      },
    },
  },
} satisfies Prisma.AdvanceBookingInclude;

type QuotationBooking = Prisma.AdvanceBookingGetPayload<{ include: typeof quotationBookingInclude }>;
type BookingAssignment = QuotationBooking["sizeLines"][number]["assignments"][number];
type BookingAllocation = BookingAssignment["grnAllocations"][number];
type AllocatedReceipt = NonNullable<BookingAllocation["finishedGoodsStockReceipt"]>;

async function getDraftQuotation(database: Database | typeof prisma, organizationId: string, quotationId: string) {
  const quotation = await database.distributionQuotation.findFirst({
    where: { id: quotationId, organization_id: organizationId },
    select: {
      id: true,
      quotation_no: true,
      mode: true,
      status: true,
      childQuotations: { select: { id: true } },
    },
  });
  if (!quotation) throw new Error("The quotation was not found in this organization.");
  if (quotation.status !== "DRAFT") throw new Error("Only draft quotations can change booking inventory fulfillment.");
  return quotation;
}

async function getQuotationBookingIds(
  database: Database | typeof prisma,
  organizationId: string,
  quotationId: string,
) {
  const quotation = await getDraftQuotation(database, organizationId, quotationId);
  const quotationIds = [quotation.id, ...quotation.childQuotations.map((child) => child.id)];
  const lines = await database.distributionQuotationLine.findMany({
    where: { organization_id: organizationId, quotation_id: { in: quotationIds } },
    select: { source_booking_id: true },
  });
  return {
    quotation,
    bookingIds: [...new Set(lines.map((line) => line.source_booking_id))],
  };
}

function bookingFulfillmentSummary(booking: QuotationBooking) {
  const allocations = booking.sizeLines.flatMap((line) =>
    line.assignments.flatMap((assignment) => assignment.grnAllocations),
  );
  const receiptIds = new Set(booking.sizeLines.flatMap((line) =>
    line.assignments.flatMap((assignment) => assignment.finishedGoodsStockReceipts.map((receipt) => receipt.id)),
  ));
  const grnNumbers = [...new Set(allocations.map((allocation) => allocation.grnLine.grn.grn_no))];
  return {
    id: booking.id,
    bookingNo: booking.booking_no,
    fulfilledQuantity: allocations.reduce((sum, allocation) => sum + allocation.allocated_quantity, 0),
    grnNumbers,
    hasFulfillment: allocations.length > 0 || receiptIds.size > 0,
  };
}

export async function listQuotationBookingFulfillment(organizationId: string, quotationId: string) {
  const { bookingIds } = await getQuotationBookingIds(prisma, organizationId, quotationId);
  if (bookingIds.length === 0) return { bookings: [] };
  const bookings = await prisma.advanceBooking.findMany({
    where: { organization_id: organizationId, id: { in: bookingIds } },
    include: quotationBookingInclude,
  });
  return {
    bookings: bookings
      .map(bookingFulfillmentSummary)
      .filter((booking) => booking.hasFulfillment),
  };
}

function collectBookingAllocations(booking: QuotationBooking) {
  const assignments = booking.sizeLines.flatMap((line) => line.assignments);
  const allocations = assignments.flatMap((assignment) => assignment.grnAllocations);
  const allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
  const assignedReceiptIds = new Set(allocations.flatMap((allocation) =>
    allocation.finishedGoodsStockReceipt ? [allocation.finishedGoodsStockReceipt.id] : [],
  ));
  const allReceiptIds = new Set(assignments.flatMap((assignment) =>
    assignment.finishedGoodsStockReceipts.map((receipt) => receipt.id),
  ));
  if (assignedReceiptIds.size !== allReceiptIds.size ||
      [...allReceiptIds].some((receiptId) => !assignedReceiptIds.has(receiptId))) {
    throw new Error(`Booking ${booking.booking_no} has inventory receipts not linked to a GRN allocation. Resolve them in Inventory before reversing fulfillment.`);
  }
  if (allocations.length === 0) {
    throw new Error(`Booking ${booking.booking_no} has no reversible Work Order GRN fulfillment.`);
  }
  return [...allocationsById.values()];
}

function requireUnusedReceipt(allocation: BookingAllocation, bookingNo: string): AllocatedReceipt {
  const receipt = allocation.finishedGoodsStockReceipt;
  if (!receipt) {
    throw new Error(`Booking ${bookingNo} has a GRN allocation without its allocated-stock receipt. Resolve the GRN in Inventory before reversing fulfillment.`);
  }
  if (
    receipt.quantity_out !== 0 ||
    receipt.current_stock !== receipt.quantity_in
  ) {
    throw new Error(`GRN ${allocation.grnLine.grn.grn_no} inventory has already been issued or changed and cannot be reversed from this screen.`);
  }
  return receipt;
}

export async function reverseQuotationBookingFulfillment(
  organizationId: string,
  userId: string,
  quotationId: string,
  bookingId: string,
) {
  if (!bookingId.trim()) throw new Error("Select a booking whose fulfillment should be reversed.");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const { bookingIds } = await getQuotationBookingIds(transaction, organizationId, quotationId);
        if (!bookingIds.includes(bookingId)) {
          throw new Error("The selected booking is not linked to this quotation or sales order.");
        }
        const booking = await transaction.advanceBooking.findFirst({
          where: { id: bookingId, organization_id: organizationId },
          include: quotationBookingInclude,
        });
        if (!booking) throw new Error("The selected booking was not found in this organization.");

        const allocations = collectBookingAllocations(booking);
        const receipts = allocations.map((allocation) => requireUnusedReceipt(allocation, booking.booking_no));
        const receiptIds = receipts.map((receipt) => receipt.id);
        const activeRequests = await transaction.finishedGoodsOutwardRequestLine.findMany({
          where: {
            organization_id: organizationId,
            source_stock_type: "ALLOCATED",
            source_stock_id: { in: receiptIds },
            request: { organization_id: organizationId, status: { not: "CANCELLED" } },
          },
          select: {
            source_stock_id: true,
            requested_quantity: true,
            shipped_quantity: true,
          },
        });
        const reservedRequest = activeRequests.find((line) =>
          line.requested_quantity.minus(line.shipped_quantity).greaterThan(0),
        );
        if (reservedRequest) {
          throw new Error("This booking's fulfilled inventory is reserved by an active finished-goods request. Cancel or reverse that request first.");
        }

        const stockTotals = new Map<string, {
          entityId: string;
          locationId: string;
          styleName: string;
          size: string;
          quantity: number;
        }>();
        for (const receipt of receipts) {
          const key = [receipt.entity_id, receipt.location_id, receipt.style_name, receipt.size].join("\u0000");
          const current = stockTotals.get(key);
          stockTotals.set(key, {
            entityId: receipt.entity_id,
            locationId: receipt.location_id,
            styleName: receipt.style_name,
            size: receipt.size,
            quantity: (current?.quantity ?? 0) + receipt.quantity_in,
          });
        }
        for (const stock of stockTotals.values()) {
          const updated = await transaction.finishedGoodsStock.updateMany({
            where: {
              organization_id: organizationId,
              entity_id: stock.entityId,
              location_id: stock.locationId,
              style_name: stock.styleName,
              size: stock.size,
              quantity_on_hand: { gte: stock.quantity },
              quantity_reserved: { gte: stock.quantity },
            },
            data: {
              quantity_on_hand: { decrement: stock.quantity },
              quantity_reserved: { decrement: stock.quantity },
            },
          });
          if (updated.count !== 1) {
            throw new Error("The finished-goods inventory aggregate does not match this booking's unused receipts. Reconcile inventory before reversing fulfillment.");
          }
        }

        const allocationQuantityByGrnLine = new Map<string, number>();
        for (const allocation of allocations) {
          allocationQuantityByGrnLine.set(
            allocation.grn_line_id,
            (allocationQuantityByGrnLine.get(allocation.grn_line_id) ?? 0) + allocation.allocated_quantity,
          );
        }
        for (const [grnLineId, quantity] of allocationQuantityByGrnLine) {
          const line = allocations.find((allocation) => allocation.grn_line_id === grnLineId)!.grnLine;
          if (line.advance_booked_quantity === null || line.advance_booked_quantity < quantity) {
            throw new Error(`GRN ${line.grn.grn_no} booking allocation totals do not match. Reconcile the GRN before reversing fulfillment.`);
          }
          const updated = await transaction.workOrderInventoryGrnLine.updateMany({
            where: {
              id: grnLineId,
              grn: { organization_id: organizationId },
              advance_booked_quantity: { gte: quantity },
            },
            data: { advance_booked_quantity: { decrement: quantity } },
          });
          if (updated.count !== 1) {
            throw new Error(`GRN ${line.grn.grn_no} changed while reversing fulfillment. Reload and try again.`);
          }
        }

        const deletedReceipts = await transaction.finishedGoodsAllocatedStockReceipt.deleteMany({
          where: { organization_id: organizationId, id: { in: receiptIds }, booking_id: bookingId },
        });
        if (deletedReceipts.count !== receiptIds.length) {
          throw new Error("Allocated stock receipts changed while reversing fulfillment. Reload and try again.");
        }
        const allocationIds = allocations.map((allocation) => allocation.id);
        const deletedAllocations = await transaction.workOrderInventoryGrnBookingAllocation.deleteMany({
          where: { organization_id: organizationId, id: { in: allocationIds } },
        });
        if (deletedAllocations.count !== allocationIds.length) {
          throw new Error("Work Order GRN allocations changed while reversing fulfillment. Reload and try again.");
        }

        const grnNumbers = [...new Set(allocations.map((allocation) => allocation.grnLine.grn.grn_no))];
        const reversedQuantity = allocations.reduce((sum, allocation) => sum + allocation.allocated_quantity, 0);
        await createAuditEvent({
          organizationId,
          userId,
          module: "Inventory Management",
          action: "REVERSE_WORK_ORDER_GRN_BOOKING_FULFILLMENT",
          entityType: "AdvanceBooking",
          entityId: booking.id,
          details: {
            quotation_id: quotationId,
            booking_no: booking.booking_no,
            grn_numbers: grnNumbers,
            reversed_quantity: reversedQuantity,
            grn_allocation_ids: allocationIds,
            stock_receipt_ids: receiptIds,
          },
        }, transaction);

        return {
          bookingId: booking.id,
          bookingNo: booking.booking_no,
          reversedQuantity,
          grnNumbers,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error("Booking inventory changed concurrently. Reload and try again.");
}
