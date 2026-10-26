import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

type Database = Prisma.TransactionClient;

function quotationBookingInclude(organizationId: string) {
  return {
    sizeLines: {
      include: {
        assignments: {
          include: {
            grnAllocations: {
              include: {
                grnLine: {
                  select: {
                    id: true,
                    size: true,
                    buyer_size: true,
                    advance_booked_quantity: true,
                    approved_quantity: true,
                    general_inventory_quantity: true,
                    grn: { select: { grn_no: true } },
                    bookingAllocations: {
                      where: { organization_id: organizationId },
                      select: { organization_id: true, allocated_quantity: true },
                    },
                    generalStockReceipt: {
                      select: {
                        id: true,
                        organization_id: true,
                        quantity_in: true,
                        quantity_out: true,
                        current_stock: true,
                      },
                    },
                  },
                },
                finishedGoodsStockReceipt: {
                  select: {
                    id: true,
                    organization_id: true,
                    entity_id: true,
                    location_id: true,
                    grn_id: true,
                    grn_line_id: true,
                    work_order_id: true,
                    order_id: true,
                    grn_no: true,
                    grn_date: true,
                    work_order_no: true,
                    order_no: true,
                    article_no: true,
                    style_name: true,
                    brand: true,
                    buyer: true,
                    product_category: true,
                    colour: true,
                    size: true,
                    buyer_size: true,
                    received_quantity: true,
                    actual_received_quantity: true,
                    approved_quantity: true,
                    rejected_quantity: true,
                    quantity_in: true,
                    current_stock: true,
                    quantity_out: true,
                    created_by: true,
                    verified_by: true,
                    posted_at: true,
                    created_at: true,
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
}

type QuotationBooking = Prisma.AdvanceBookingGetPayload<{
  include: ReturnType<typeof quotationBookingInclude>;
}>;
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
    include: quotationBookingInclude(organizationId),
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

function requireUnusedReceipt(
  allocation: BookingAllocation,
  bookingNo: string,
  organizationId: string,
): AllocatedReceipt {
  const receipt = allocation.finishedGoodsStockReceipt;
  if (!receipt) {
    throw new Error(`Booking ${bookingNo} has a GRN allocation without its allocated-stock receipt. Resolve the GRN in Inventory before reversing fulfillment.`);
  }
  if (receipt.organization_id !== organizationId) {
    throw new Error(`GRN ${allocation.grnLine.grn.grn_no} allocated-stock receipt is not available in this organization.`);
  }
  if (receipt.quantity_out > 0) {
    throw new Error(
      `GRN ${allocation.grnLine.grn.grn_no} has ${receipt.quantity_out} PCS issued from booking ${bookingNo}. Issued stock must be resolved before deleting this sales order.`,
    );
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
          include: quotationBookingInclude(organizationId),
        });
        if (!booking) throw new Error("The selected booking was not found in this organization.");

        const allocations = collectBookingAllocations(booking);
        const receipts = allocations.map((allocation) => {
          const receipt = allocation.finishedGoodsStockReceipt;
          if (!receipt) {
            throw new Error(
              `Booking ${booking.booking_no} has a GRN allocation without its allocated-stock receipt. Resolve that missing receipt before deleting this sales order.`,
            );
          }
          if (receipt.organization_id !== organizationId) {
            throw new Error(
              `GRN ${allocation.grnLine.grn.grn_no} allocated-stock receipt is not available in this organization.`,
            );
          }
          return receipt;
        });
        const receiptIds = receipts.map((receipt) => receipt.id);
        const activeRequests = await transaction.finishedGoodsOutwardRequestLine.findMany({
          where: {
            organization_id: organizationId,
            source_stock_type: "ALLOCATED",
            source_stock_id: { in: receiptIds },
            request: { organization_id: organizationId, status: { not: "CANCELLED" } },
          },
          select: {
            id: true,
            request_id: true,
            source_stock_id: true,
            requested_quantity: true,
            shipped_quantity: true,
            request: {
              select: {
                id: true,
                request_no: true,
                status: true,
              },
            },
          },
        });
        if (activeRequests.length > 0) {
          const requestDetails = [...new Map(activeRequests.map((line) => [
            line.request.id,
            {
              requestNo: line.request.request_no,
              status: line.request.status,
              requestedQuantity: activeRequests
                .filter((requestLine) => requestLine.request.id === line.request.id)
                .reduce((total, requestLine) => total + Number(requestLine.requested_quantity), 0),
              issuedQuantity: activeRequests
                .filter((requestLine) => requestLine.request.id === line.request.id)
                .reduce((total, requestLine) => total + Number(requestLine.shipped_quantity), 0),
            },
          ])).values()];
          const details = requestDetails.map((request) =>
            `${request.requestNo} (${request.status}, ${request.requestedQuantity} PCS requested, ${request.issuedQuantity} PCS issued)`,
          ).join("; ");
          throw new Error(
            `Cannot delete this sales order: linked allocated stock is used by ${details}. Resolve or cancel these stock requests first.`,
          );
        }
        const issuedReceipts = allocations.filter((allocation) =>
          (allocation.finishedGoodsStockReceipt?.quantity_out ?? 0) > 0,
        );
        if (issuedReceipts.length > 0) {
          const issuedDetails = issuedReceipts.map((allocation) =>
            `${allocation.grnLine.grn.grn_no}, size ${allocation.grnLine.size || allocation.grnLine.buyer_size || "unspecified"}: ${allocation.finishedGoodsStockReceipt!.quantity_out} PCS issued`,
          ).join("; ");
          throw new Error(
            `Cannot delete this sales order: linked booking inventory has already been issued (${issuedDetails}). Resolve the issued stock first.`,
          );
        }
        allocations.forEach((allocation) =>
          requireUnusedReceipt(allocation, booking.booking_no, organizationId),
        );

        const stockTotals = new Map<string, {
          entityId: string;
          locationId: string;
          styleName: string;
          size: string;
          quantity: number;
        }>();
        for (const allocation of allocations) {
          const receipt = allocation.finishedGoodsStockReceipt!;
          const key = [receipt.entity_id, receipt.location_id, receipt.style_name, receipt.size].join("\u0000");
          const current = stockTotals.get(key);
          stockTotals.set(key, {
            entityId: receipt.entity_id,
            locationId: receipt.location_id,
            styleName: receipt.style_name,
            size: receipt.size,
            quantity: (current?.quantity ?? 0) + allocation.allocated_quantity,
          });
        }
        const allocationQuantityByGrnLine = new Map<string, number>();
        for (const allocation of allocations) {
          allocationQuantityByGrnLine.set(
            allocation.grn_line_id,
            (allocationQuantityByGrnLine.get(allocation.grn_line_id) ?? 0) + allocation.allocated_quantity,
          );
        }
        const grnLineTotals = [...allocationQuantityByGrnLine].map(([grnLineId, quantity]) => {
          const line = allocations.find((allocation) => allocation.grn_line_id === grnLineId)!.grnLine;
          const allAllocations = line.bookingAllocations.filter((allocation) =>
            allocation.organization_id === organizationId,
          );
          const allAllocatedQuantity = allAllocations.reduce(
            (sum, allocation) => sum + allocation.allocated_quantity,
            0,
          );
          const generalQuantity = line.general_inventory_quantity ?? 0;
          const generalReceipt = line.generalStockReceipt;
          const remainingAllocatedQuantity = Math.max(allAllocatedQuantity - quantity, 0);
          const allocation = allocations.find((candidate) => candidate.grn_line_id === grnLineId)!;
          const receipt = allocation.finishedGoodsStockReceipt;
          if (!receipt) {
            throw new Error(`GRN ${line.grn.grn_no} has no reversible allocated-stock receipt.`);
          }
          return {
            grnLineId,
            grnNo: line.grn.grn_no,
            quantity,
            remainingAllocatedQuantity,
            generalQuantity: line.approved_quantity !== null &&
              Number.isSafeInteger(line.approved_quantity) &&
              Number.isSafeInteger(remainingAllocatedQuantity) &&
              line.approved_quantity >= remainingAllocatedQuantity
              ? line.approved_quantity - remainingAllocatedQuantity
              : generalQuantity + quantity,
            line,
            generalReceipt,
            sourceReceipt: receipt,
          };
        });

        for (const stock of stockTotals.values()) {
          const updated = await transaction.finishedGoodsStock.updateMany({
            where: {
              organization_id: organizationId,
              entity_id: stock.entityId,
              location_id: stock.locationId,
              style_name: stock.styleName,
              size: stock.size,
              quantity_reserved: { gte: stock.quantity },
            },
            data: { quantity_reserved: { decrement: stock.quantity } },
          });
          if (updated.count !== 1) {
            throw new Error("The finished-goods reserved balance does not match this booking's unused receipts. Reconcile inventory before reversing fulfillment.");
          }
        }

        for (const grnLine of grnLineTotals) {
          const { sourceReceipt, generalReceipt, quantity, generalQuantity, line, grnLineId, grnNo } = grnLine;
          if (generalReceipt) {
            const updatedGeneralReceipt = await transaction.finishedGoodsGeneralStockReceipt.updateMany({
              where: {
                id: generalReceipt.id,
                organization_id: organizationId,
                quantity_in: generalReceipt.quantity_in,
                current_stock: generalReceipt.current_stock,
              },
              data: {
                quantity_in: { increment: quantity },
                current_stock: { increment: quantity },
              },
            });
            if (updatedGeneralReceipt.count !== 1) {
              throw new Error(`GRN ${grnNo} general stock changed while reversing fulfillment. Reload and try again.`);
            }
          } else {
            await transaction.finishedGoodsGeneralStockReceipt.create({
              data: {
                organization_id: organizationId,
                entity_id: sourceReceipt.entity_id,
                location_id: sourceReceipt.location_id,
                grn_id: sourceReceipt.grn_id,
                grn_line_id: sourceReceipt.grn_line_id,
                work_order_id: sourceReceipt.work_order_id,
                order_id: sourceReceipt.order_id,
                grn_no: sourceReceipt.grn_no,
                grn_date: sourceReceipt.grn_date,
                work_order_no: sourceReceipt.work_order_no,
                order_no: sourceReceipt.order_no,
                article_no: sourceReceipt.article_no,
                style_name: sourceReceipt.style_name,
                brand: sourceReceipt.brand,
                buyer: sourceReceipt.buyer,
                product_category: sourceReceipt.product_category,
                colour: sourceReceipt.colour,
                size: sourceReceipt.size,
                buyer_size: sourceReceipt.buyer_size,
                received_quantity: sourceReceipt.received_quantity,
                actual_received_quantity: sourceReceipt.actual_received_quantity,
                approved_quantity: sourceReceipt.approved_quantity,
                rejected_quantity: sourceReceipt.rejected_quantity,
                quantity_in: quantity,
                current_stock: quantity,
                created_by: sourceReceipt.created_by,
                verified_by: sourceReceipt.verified_by,
                posted_at: sourceReceipt.posted_at,
                created_at: sourceReceipt.created_at,
              },
            });
          }

          const updated = await transaction.workOrderInventoryGrnLine.updateMany({
            where: {
              id: grnLineId,
              grn: { organization_id: organizationId },
              advance_booked_quantity: line.advance_booked_quantity,
              general_inventory_quantity: line.general_inventory_quantity,
            },
            data: {
              advance_booked_quantity: grnLine.remainingAllocatedQuantity,
              general_inventory_quantity: generalQuantity,
            },
          });
          if (updated.count !== 1) {
            throw new Error(`GRN ${grnNo} changed while reversing fulfillment. Reload and try again.`);
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
            transferred_to_general_quantity: reversedQuantity,
            cancelled_outward_request_ids: [],
            cancelled_outward_request_line_ids: [],
            stock_effect: "Moved unused allocated receipts to general stock without reducing on-hand quantity.",
            grn_allocation_ids: allocationIds,
            stock_receipt_ids: receiptIds,
          },
        }, transaction);

        return {
          bookingId: booking.id,
          bookingNo: booking.booking_no,
          reversedQuantity,
          grnNumbers,
          cancelledRequestLineCount: 0,
          fullyCancelledRequestCount: 0,
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

export async function reverseAdvanceBookingFulfillment(
  organizationId: string,
  userId: string,
  bookingId: string,
) {
  const quotationLine = await prisma.distributionQuotationLine.findFirst({
    where: { organization_id: organizationId, source_booking_id: bookingId },
    select: {
      quotation: {
        select: {
          id: true,
          parentQuotation: { select: { id: true } },
        },
      },
    },
  });
  if (!quotationLine) {
    throw new Error("This advance booking is not linked to a quotation or sales order.");
  }
  const quotationId = quotationLine.quotation.parentQuotation?.id ?? quotationLine.quotation.id;
  return reverseQuotationBookingFulfillment(organizationId, userId, quotationId, bookingId);
}
