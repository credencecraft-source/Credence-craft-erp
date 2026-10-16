import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import {
  getSizeGroupSizeOrderMapForOrganization,
  sortBySizeGroupOrder,
} from "@/lib/master-data/master-data-constants";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

type Database = Prisma.TransactionClient;

export type GeneralStockAllocationLineInput = {
  bookingSizeLineId: string;
  quantity: number;
};

function normalizedSize(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase() ?? "";
}

export async function listGeneralFinishedGoodsAvailability(
  organizationId: string,
  orderIds: string[],
) {
  const uniqueOrderIds = [...new Set(orderIds)];
  if (uniqueOrderIds.length === 0) return new Map<string, Map<string, number>>();

  const receipts = await prisma.finishedGoodsGeneralStockReceipt.findMany({
    where: {
      organization_id: organizationId,
      order_id: { in: uniqueOrderIds },
      current_stock: { gt: 0 },
    },
    select: { order_id: true, size: true, current_stock: true },
  });
  const availability = new Map<string, Map<string, number>>();
  for (const receipt of receipts) {
    const size = normalizedSize(receipt.size);
    if (!size) continue;
    const sizes = availability.get(receipt.order_id) ?? new Map<string, number>();
    sizes.set(size, (sizes.get(size) ?? 0) + receipt.current_stock);
    availability.set(receipt.order_id, sizes);
  }
  return availability;
}

export async function allocateBookingFromGeneralStockInTransaction(
  transaction: Database,
  organizationId: string,
  userId: string,
  bookingId: string,
  requestedLines: GeneralStockAllocationLineInput[],
) {
  const booking = await transaction.advanceBooking.findFirst({
    where: { id: bookingId, organization_id: organizationId },
    select: {
      id: true,
      booking_no: true,
      order_id: true,
      order: { select: { sourceStatus: true, article: true, sizeGroup: true } },
      quotationLines: {
        select: {
          quotation: {
            select: { parentQuotation: { select: { id: true } } },
          },
        },
        take: 1,
      },
      sizeLines: {
        select: {
          id: true,
          size: true,
          booked_quantity: true,
          assignments: {
            where: { organization_id: organizationId },
            select: {
              id: true,
              work_order_id: true,
              work_order_size_line_id: true,
              assigned_quantity: true,
              grnAllocations: { select: { allocated_quantity: true } },
            },
          },
        },
      },
    },
  });
  if (!booking) throw new Error("Advance booking was not found in this organization.");
  const sizeGroupOrderByReference = await getSizeGroupSizeOrderMapForOrganization(
    organizationId,
    booking.order.sizeGroup ? [booking.order.sizeGroup] : [],
    transaction,
  );
  const sizeGroupOrder = sizeGroupOrderByReference.get(booking.order.sizeGroup?.trim().toLocaleLowerCase() ?? "") ?? [];
  if (booking.order.sourceStatus !== "ARTICLE_BASED") {
    const matchingArticle = booking.order.article?.trim()
      ? await transaction.masterArticle.findFirst({
          where: {
            organization_id: organizationId,
            article: booking.order.article.trim(),
          },
          select: { id: true },
        })
      : null;
    if (!matchingArticle) {
      throw new Error("General stock can only be allocated to bookings from Article-based orders.");
    }
  }
  if (!booking.quotationLines[0]?.quotation.parentQuotation) {
    throw new Error("Create a Sales Order before allocating general stock to this advance booking.");
  }
  const bookingLineIds = new Set(booking.sizeLines.map((line) => line.id));
  const requestedByLineId = new Map(requestedLines.map((line) => [line.bookingSizeLineId, line.quantity]));
  if ([...requestedByLineId.keys()].some((id) => !bookingLineIds.has(id))) {
    throw new Error("One or more selected sizes do not belong to this advance booking.");
  }

  const receipts = await transaction.finishedGoodsGeneralStockReceipt.findMany({
    where: {
      organization_id: organizationId,
      order_id: booking.order_id,
      current_stock: { gt: 0 },
    },
    include: {
      grnLine: {
        select: {
          workOrderSizeLine: {
            select: {
              id: true,
              work_order_id: true,
              quantity: true,
              bookingAssignments: {
                where: { organization_id: organizationId },
                select: {
                  id: true,
                  booking_size_line_id: true,
                  assigned_quantity: true,
                },
              },
            },
          },
          bookingAllocations: {
            select: {
              id: true,
              booking_assignment_id: true,
              allocated_quantity: true,
              finishedGoodsStockReceipt: {
                select: { id: true, current_stock: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ posted_at: "asc" }, { id: "asc" }],
  });

  const bookingLines = sortBySizeGroupOrder(booking.sizeLines, sizeGroupOrder, (line) => line.size);
  const fulfilledQuantityByLine = new Map(bookingLines.map((line) => [
    line.id,
    line.assignments.reduce((sum, assignment) =>
      sum + assignment.grnAllocations.reduce((lineSum, allocation) => lineSum + allocation.allocated_quantity, 0), 0),
  ]));
  const results: Array<{ size: string; quantity: number }> = [];
  const allocationAudit: Array<{ size: string; quantity: number; workOrderId: string; receiptId: string }> = [];

  for (const bookingLine of bookingLines) {
    let requestedRemaining = requestedByLineId.get(bookingLine.id) ?? 0;
    if (requestedRemaining <= 0) continue;
    let bookingRemaining = Math.max(bookingLine.booked_quantity - (fulfilledQuantityByLine.get(bookingLine.id) ?? 0), 0);

    for (const receipt of receipts) {
      if (requestedRemaining <= 0 || bookingRemaining <= 0 || receipt.current_stock <= 0) continue;
      if (normalizedSize(receipt.size) !== normalizedSize(bookingLine.size)) continue;

      const workOrderSizeLine = receipt.grnLine.workOrderSizeLine;
      const assignments = workOrderSizeLine.bookingAssignments;
      const workOrderAssigned = assignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0);
      const workOrderRemaining = Math.max(workOrderSizeLine.quantity - workOrderAssigned, 0);
      const existingAssignment = assignments.find((assignment) => assignment.booking_size_line_id === bookingLine.id);
      const existingBookingAssignment = bookingLine.assignments.find(
        (assignment) => assignment.work_order_size_line_id === workOrderSizeLine.id,
      );
      const existingAssignmentRemaining = existingBookingAssignment
        ? Math.max(
            existingBookingAssignment.assigned_quantity -
              existingBookingAssignment.grnAllocations.reduce((sum, allocation) => sum + allocation.allocated_quantity, 0),
            0,
          )
        : 0;
      const bookingUnassigned = Math.max(
        bookingLine.booked_quantity -
          bookingLine.assignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0),
        0,
      );
      const assignmentCapacity = Math.min(workOrderRemaining, bookingUnassigned);
      const allocationQuantity = Math.min(
        receipt.current_stock,
        bookingRemaining,
        existingAssignmentRemaining + assignmentCapacity,
        requestedRemaining,
      );
      if (allocationQuantity <= 0) continue;
      const assignmentQuantityToAdd = Math.max(allocationQuantity - existingAssignmentRemaining, 0);

      let assignmentId = existingAssignment?.id;
      if (existingAssignment) {
        if (assignmentQuantityToAdd > 0) {
          const updated = await transaction.advanceBookingWorkOrderAssignment.updateMany({
            where: { id: existingAssignment.id, organization_id: organizationId },
            data: { assigned_quantity: { increment: assignmentQuantityToAdd } },
          });
          if (updated.count !== 1) throw new Error("The work-order assignment changed. Reload and try again.");
        }
      } else {
        const assignment = await transaction.advanceBookingWorkOrderAssignment.create({
          data: {
            organization_id: organizationId,
            booking_size_line_id: bookingLine.id,
            work_order_id: workOrderSizeLine.work_order_id,
            work_order_size_line_id: workOrderSizeLine.id,
            assigned_quantity: assignmentQuantityToAdd,
            created_by: userId,
          },
          select: { id: true },
        });
        assignmentId = assignment.id;
      }
      if (!assignmentId) throw new Error("Unable to create a work-order assignment for general-stock allocation.");

      const stockUpdate = await transaction.finishedGoodsGeneralStockReceipt.updateMany({
        where: {
          id: receipt.id,
          organization_id: organizationId,
          current_stock: receipt.current_stock,
        },
        data: {
          quantity_out: { increment: allocationQuantity },
          current_stock: { decrement: allocationQuantity },
        },
      });
      if (stockUpdate.count !== 1) {
        throw new Error("General finished-goods stock changed during allocation. Reload and try again.");
      }

      const existingGrnAllocation = receipt.grnLine.bookingAllocations.find(
        (allocation) => allocation.booking_assignment_id === assignmentId,
      );
      if (existingGrnAllocation) {
        if (!existingGrnAllocation.finishedGoodsStockReceipt) {
          throw new Error("The existing allocated-stock record is missing for this GRN allocation. Contact an administrator.");
        }
        const allocationUpdate = await transaction.workOrderInventoryGrnBookingAllocation.updateMany({
          where: {
            id: existingGrnAllocation.id,
            organization_id: organizationId,
            allocated_quantity: existingGrnAllocation.allocated_quantity,
          },
          data: { allocated_quantity: { increment: allocationQuantity } },
        });
        if (allocationUpdate.count !== 1) {
          throw new Error("The GRN allocation changed during general-stock allocation. Reload and try again.");
        }
        const allocatedReceiptUpdate = await transaction.finishedGoodsAllocatedStockReceipt.updateMany({
          where: {
            id: existingGrnAllocation.finishedGoodsStockReceipt.id,
            organization_id: organizationId,
            current_stock: existingGrnAllocation.finishedGoodsStockReceipt.current_stock,
          },
          data: {
            quantity_in: { increment: allocationQuantity },
            current_stock: { increment: allocationQuantity },
          },
        });
        if (allocatedReceiptUpdate.count !== 1) {
          throw new Error("The allocated finished-goods balance changed. Reload and try again.");
        }
        existingGrnAllocation.allocated_quantity += allocationQuantity;
        existingGrnAllocation.finishedGoodsStockReceipt.current_stock += allocationQuantity;
      } else {
        const grnAllocation = await transaction.workOrderInventoryGrnBookingAllocation.create({
          data: {
            organization_id: organizationId,
            grn_line_id: receipt.grn_line_id,
            booking_assignment_id: assignmentId,
            allocated_quantity: allocationQuantity,
            created_by: userId,
          },
          select: { id: true },
        });
        await transaction.finishedGoodsAllocatedStockReceipt.create({
          data: {
          organization_id: organizationId,
          entity_id: receipt.entity_id,
          location_id: receipt.location_id,
          grn_id: receipt.grn_id,
          grn_line_id: receipt.grn_line_id,
          grn_allocation_id: grnAllocation.id,
          work_order_id: receipt.work_order_id,
          order_id: receipt.order_id,
          booking_id: booking.id,
          booking_size_line_id: bookingLine.id,
          booking_assignment_id: assignmentId,
          grn_no: receipt.grn_no,
          grn_date: receipt.grn_date,
          work_order_no: receipt.work_order_no,
          order_no: receipt.order_no,
          booking_no: booking.booking_no,
          article_no: receipt.article_no,
          style_name: receipt.style_name,
          brand: receipt.brand,
          buyer: receipt.buyer,
          product_category: receipt.product_category,
          colour: receipt.colour,
          size: receipt.size,
          buyer_size: receipt.buyer_size,
          received_quantity: receipt.received_quantity,
          actual_received_quantity: receipt.actual_received_quantity,
          approved_quantity: receipt.approved_quantity,
          rejected_quantity: receipt.rejected_quantity,
          quantity_in: allocationQuantity,
          current_stock: allocationQuantity,
          created_by: receipt.created_by,
          verified_by: receipt.verified_by,
          posted_at: receipt.posted_at,
          },
          select: { id: true },
        });
      }
      const reservedQuantity = new Prisma.Decimal(allocationQuantity);
      await transaction.finishedGoodsStock.upsert({
        where: {
          organization_id_style_name_size_location_id: {
            organization_id: organizationId,
            style_name: receipt.style_name,
            size: receipt.size,
            location_id: receipt.location_id,
          },
        },
        create: {
          organization_id: organizationId,
          entity_id: receipt.entity_id,
          location_id: receipt.location_id,
          style_name: receipt.style_name,
          size: receipt.size,
          quantity_on_hand: new Prisma.Decimal(0),
          quantity_reserved: reservedQuantity,
        },
        update: { quantity_reserved: { increment: reservedQuantity } },
      });

      receipt.current_stock -= allocationQuantity;
      bookingRemaining -= allocationQuantity;
      requestedRemaining -= allocationQuantity;
      fulfilledQuantityByLine.set(
        bookingLine.id,
        (fulfilledQuantityByLine.get(bookingLine.id) ?? 0) + allocationQuantity,
      );
      for (const relatedReceipt of receipts) {
        if (relatedReceipt.grnLine.workOrderSizeLine.id !== workOrderSizeLine.id) continue;
        const relatedAssignment = relatedReceipt.grnLine.workOrderSizeLine.bookingAssignments.find(
          (assignment) => assignment.id === assignmentId,
        );
        if (relatedAssignment) {
          relatedAssignment.assigned_quantity += assignmentQuantityToAdd;
        } else {
          relatedReceipt.grnLine.workOrderSizeLine.bookingAssignments.push({
            id: assignmentId,
            booking_size_line_id: bookingLine.id,
            assigned_quantity: allocationQuantity,
          });
        }
      }
      if (existingBookingAssignment) {
        existingBookingAssignment.assigned_quantity += assignmentQuantityToAdd;
        existingBookingAssignment.grnAllocations.push({ allocated_quantity: allocationQuantity });
      } else {
        bookingLine.assignments.push({
          id: assignmentId,
          work_order_id: receipt.work_order_id,
          work_order_size_line_id: workOrderSizeLine.id,
          assigned_quantity: assignmentQuantityToAdd,
          grnAllocations: [{ allocated_quantity: allocationQuantity }],
        });
      }
      const result = results.find((item) => normalizedSize(item.size) === normalizedSize(bookingLine.size));
      if (result) result.quantity += allocationQuantity;
      else results.push({ size: bookingLine.size, quantity: allocationQuantity });
      allocationAudit.push({
        size: bookingLine.size,
        quantity: allocationQuantity,
        workOrderId: receipt.work_order_id,
        receiptId: receipt.id,
      });
    }
    if (requestedRemaining > 0) {
      throw new Error(`Requested general-stock quantity for size ${bookingLine.size} exceeds its available stock or unassigned balance.`);
    }
  }

  if (results.length === 0) {
    throw new Error("No unassigned booking quantity and matching available general stock were found.");
  }

  await createAuditEvent({
    organizationId,
    userId,
    module: "Inventory",
    action: "ALLOCATE_GENERAL_FINISHED_GOODS_TO_BOOKING",
    entityType: "AdvanceBooking",
    entityId: booking.id,
    details: {
      booking_no: booking.booking_no,
      allocated_lines: results,
      sources: allocationAudit,
    },
  }, transaction);

  return { bookingId: booking.id, bookingNo: booking.booking_no, allocatedLines: results };
}

export async function allocateAdvanceBookingFromGeneralStock(
  organizationId: string,
  userId: string,
  bookingId: string,
  requestedLines: GeneralStockAllocationLineInput[],
) {
  if (!organizationId.trim() || !userId.trim() || !bookingId.trim()) {
    throw new Error("A valid organization, actor, and advance booking are required.");
  }
  if (!Array.isArray(requestedLines) || requestedLines.length === 0 || requestedLines.length > 200) {
    throw new Error("Submit at least one size-wise general-stock quantity.");
  }
  const seenLineIds = new Set<string>();
  const normalizedRequestedLines: GeneralStockAllocationLineInput[] = [];
  for (const line of requestedLines) {
    const bookingSizeLineId = typeof line?.bookingSizeLineId === "string" ? line.bookingSizeLineId.trim() : "";
    if (
      !line ||
      !bookingSizeLineId ||
      seenLineIds.has(bookingSizeLineId) ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > 2147483647
    ) {
      throw new Error("Each selected size needs a unique booking size and a positive whole-number quantity.");
    }
    seenLineIds.add(bookingSizeLineId);
    normalizedRequestedLines.push({ bookingSizeLineId, quantity: line.quantity });
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => allocateBookingFromGeneralStockInTransaction(
          transaction,
          organizationId,
          userId,
          bookingId,
          normalizedRequestedLines,
        ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error("General finished-goods stock changed concurrently. Reload and try again.");
}
