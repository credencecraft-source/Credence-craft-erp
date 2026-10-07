import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
import {
  calculateWorkOrderGrnVerificationSplit,
  normalizeWorkOrderGrnLines,
  type WorkOrderGrnLineInput,
} from "@/lib/services/inventory/work-order-grn-validation";
import { allocateApprovedReceiptToBookingAssignments } from "@/lib/services/inventory/work-order-grn-booking-allocation";

type Database = Prisma.TransactionClient;

function parseGrnDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid GRN date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid GRN date.");
  }
  return date;
}

function mapGrn(record: {
  id: string;
  grn_no: string;
  grn_date: Date;
  status: string;
  notes: string | null;
  created_at: Date;
  workOrder: {
    id: string;
    work_order_no: string;
    order_no: string;
    total_qty: number;
    status: string;
    order: {
      article: string | null;
      styleName: string | null;
      brand: string | null;
      entity: { is_active: boolean; locations: Array<{ id: string; location_name: string }> } | null;
    };
  };
  lines: Array<{
    id: string;
    work_order_size_line_id: string;
    size: string | null;
    buyer_size: string | null;
    ordered_quantity: number;
    available_quantity: number;
    received_quantity: number;
    verified_actual_quantity: number | null;
    approved_quantity: number | null;
    rejected_quantity: number | null;
    advance_booked_quantity: number | null;
    general_inventory_quantity: number | null;
    workOrderSizeLine: {
      bookingAssignments: Array<{
        id: string;
        assigned_quantity: number;
        bookingSizeLine: {
          id: string;
          size: string;
          booking: { id: string; booking_no: string };
        };
        grnAllocations: Array<{ allocated_quantity: number }>;
      }>;
    };
  }>;
}) {
  return {
    id: record.id,
    grnNo: record.grn_no,
    receivedDate: record.grn_date.toISOString().slice(0, 10),
    status: record.status,
    notes: record.notes ?? "",
    createdAt: record.created_at.toISOString(),
    workOrder: {
      id: record.workOrder.id,
      workOrderNo: record.workOrder.work_order_no,
      orderNo: record.workOrder.order_no,
      totalQty: record.workOrder.total_qty,
      status: record.workOrder.status,
      article: record.workOrder.order.article,
      styleName: record.workOrder.order.styleName,
      brand: record.workOrder.order.brand,
      locations: record.workOrder.order.entity?.is_active ? record.workOrder.order.entity.locations : [],
    },
    lines: record.lines.map((line) => ({
      id: line.id,
      workOrderSizeLineId: line.work_order_size_line_id,
      size: line.size,
      buyerSize: line.buyer_size,
      orderedQuantity: line.ordered_quantity,
      availableQuantity: line.available_quantity,
      receivedQuantity: line.received_quantity,
      verifiedActualQuantity: line.verified_actual_quantity,
      approvedQuantity: line.approved_quantity,
      rejectedQuantity: line.rejected_quantity,
      advanceBookedQuantity: line.advance_booked_quantity,
      generalInventoryQuantity: line.general_inventory_quantity,
      bookingAssignments: line.workOrderSizeLine.bookingAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        bookingNo: assignment.bookingSizeLine.booking.booking_no,
        size: assignment.bookingSizeLine.size,
        assignedQuantity: assignment.assigned_quantity,
        fulfilledQuantity: assignment.grnAllocations.reduce((sum, allocation) => sum + allocation.allocated_quantity, 0),
      })),
    })),
  };
}

const grnIncludes = {
  workOrder: {
    select: {
      id: true,
      order_id: true,
      work_order_no: true,
      order_no: true,
      total_qty: true,
      status: true,
      order: {
        select: {
          entity_id: true,
          article: true,
          styleName: true,
          brand: true,
          buyer: true,
          category: true,
          colors: true,
          entity: {
            select: {
              is_active: true,
              locations: {
                where: { is_active: true },
                select: { id: true, location_name: true },
                orderBy: [{ sort_order: "asc" as const }, { location_name: "asc" as const }],
              },
            },
          },
        },
      },
    },
  },
  lines: {
    include: {
      workOrderSizeLine: {
        include: {
          bookingAssignments: {
            include: {
              bookingSizeLine: { include: { booking: { select: { id: true, booking_no: true } } } },
              grnAllocations: { select: { allocated_quantity: true } },
            },
            orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
          },
        },
      },
    },
    orderBy: [{ size: "asc" as const }, { buyer_size: "asc" as const }],
  },
};

export async function listWorkOrderInventoryGrns(
  organizationId: string,
  options: { status?: string; cursor?: string; limit?: number } = {},
) {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 200);
  if (options.cursor) {
    const cursorRecord = await prisma.workOrderInventoryGrn.findFirst({
      where: {
        id: options.cursor,
        organization_id: organizationId,
        ...(options.status ? { status: options.status } : {}),
      },
      select: { id: true },
    });
    if (!cursorRecord) throw new Error("The Work Order GRN list changed. Refresh and try again.");
  }
  const records = await prisma.workOrderInventoryGrn.findMany({
    where: {
      organization_id: organizationId,
      ...(options.status ? { status: options.status } : {}),
    },
    include: grnIncludes,
    orderBy: [{ grn_date: "desc" }, { created_at: "desc" }, { grn_no: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: take + 1,
  });
  const hasMore = records.length > take;
  const page = hasMore ? records.slice(0, take) : records;
  return {
    grns: page.map(mapGrn),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function listWorkOrdersForReceiving(
  organizationId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 200);
  if (options.cursor) {
    const cursorRecord = await prisma.factoryWorkOrder.findFirst({
      where: {
        id: options.cursor,
        organization_id: organizationId,
      },
      select: { id: true },
    });
    if (!cursorRecord) throw new Error("The work-order list changed. Refresh and try again.");
  }
  const records = await prisma.factoryWorkOrder.findMany({
    where: { organization_id: organizationId },
    include: {
      order: { select: { article: true, styleName: true, brand: true, buyer: true } },
      sizeLines: {
        select: { id: true, size: true, buyer_size: true, quantity: true },
      },
    },
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: take + 1,
  });
  const hasMore = records.length > take;
  const page = hasMore ? records.slice(0, take) : records;
  const workOrderIds = page.map((workOrder) => workOrder.id);
  const priorLines = workOrderIds.length > 0
    ? await prisma.workOrderInventoryGrnLine.findMany({
        where: {
          work_order_id: { in: workOrderIds },
          grn: { organization_id: organizationId },
        },
        select: {
          work_order_id: true,
          work_order_size_line_id: true,
          received_quantity: true,
          verified_actual_quantity: true,
          approved_quantity: true,
        },
      })
    : [];
  const receivedByWorkOrderSize = new Map<string, number>();
  for (const line of priorLines) {
    const key = `${line.work_order_id}:${line.work_order_size_line_id}`;
    const received = line.verified_actual_quantity === null
      ? line.received_quantity
      : line.approved_quantity ?? 0;
    receivedByWorkOrderSize.set(key, (receivedByWorkOrderSize.get(key) ?? 0) + received);
  }

  return {
    workOrders: page.map((workOrder) => ({
      id: workOrder.id,
      orderId: workOrder.order_id,
      workOrderNo: workOrder.work_order_no,
      orderNo: workOrder.order_no,
      article: workOrder.order.article,
      styleName: workOrder.order.styleName,
      brand: workOrder.order.brand,
      buyer: workOrder.order.buyer,
      totalQty: workOrder.total_qty,
      status: workOrder.status,
      sizeLines: workOrder.sizeLines.map((line) => {
        const previouslyReceivedQuantity = receivedByWorkOrderSize.get(`${workOrder.id}:${line.id}`) ?? 0;
        return {
          id: line.id,
          size: line.size,
          buyerSize: line.buyer_size,
          quantity: line.quantity,
          previouslyReceivedQuantity,
          availableQuantity: Math.max(line.quantity - previouslyReceivedQuantity, 0),
        };
      }),
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

async function createInTransaction(
  transaction: Database,
  organizationId: string,
  userId: string,
  input: {
    workOrderId: string;
    receivedDate: string;
    notes?: string;
    lines: WorkOrderGrnLineInput[];
  },
) {
  const workOrder = await transaction.factoryWorkOrder.findFirst({
    where: { id: input.workOrderId, organization_id: organizationId },
    select: {
      id: true,
      work_order_no: true,
      status: true,
      sizeLines: {
        select: { id: true, size: true, buyer_size: true, quantity: true },
      },
    },
  });
  if (!workOrder) throw new Error("Work order was not found in this organization.");

  const priorLines = await transaction.workOrderInventoryGrnLine.findMany({
    where: {
      work_order_id: workOrder.id,
      grn: { organization_id: organizationId },
    },
    select: {
      work_order_size_line_id: true,
      received_quantity: true,
      verified_actual_quantity: true,
      approved_quantity: true,
    },
  });
  const normalized = normalizeWorkOrderGrnLines(
    workOrder.sizeLines.map((line) => ({
      id: line.id,
      size: line.size,
      buyerSize: line.buyer_size,
      quantity: line.quantity,
    })),
    priorLines.map((line) => ({
      workOrderSizeLineId: line.work_order_size_line_id,
      receivedQuantity: line.received_quantity,
      verifiedActualQuantity: line.verified_actual_quantity,
      approvedQuantity: line.approved_quantity,
    })),
    input.lines,
  );
  const grn = await transaction.workOrderInventoryGrn.create({
    data: {
      organization_id: organizationId,
      work_order_id: workOrder.id,
      grn_no: await reserveChallanNumber(organizationId, "FACTORY_GRN", transaction),
      grn_date: parseGrnDate(input.receivedDate),
      submitted_by: userId,
      notes: input.notes?.trim() || null,
      lines: {
        create: normalized.map((line) => ({
          size: line.size,
          buyer_size: line.buyerSize,
          ordered_quantity: line.orderedQuantity,
          available_quantity: line.availableQuantity,
          received_quantity: line.receivedQuantity,
          workOrderSizeLine: {
            connect: {
              work_order_id_id: {
                work_order_id: workOrder.id,
                id: line.workOrderSizeLineId,
              },
            },
          },
        })),
      },
    },
    include: grnIncludes,
  });
  await createAuditEvent({
    organizationId,
    userId,
    module: "Inventory Management",
    action: "CREATE_WORK_ORDER_GRN",
    entityType: "WorkOrderInventoryGrn",
    entityId: grn.id,
    details: {
      grn_no: grn.grn_no,
      work_order_id: workOrder.id,
      work_order_no: workOrder.work_order_no,
      received_line_count: normalized.filter((line) => line.receivedQuantity > 0).length,
      received_quantity: normalized.reduce((total, line) => total + line.receivedQuantity, 0),
    },
  }, transaction);
  return mapGrn(grn);
}

export async function createWorkOrderInventoryGrn(
  organizationId: string,
  userId: string,
  input: {
    workOrderId: string;
    receivedDate: string;
    notes?: string;
    lines: WorkOrderGrnLineInput[];
  },
) {
  if (!input.workOrderId.trim()) throw new Error("Select a work order.");
  if (input.notes && input.notes.length > 1000) throw new Error("GRN notes cannot exceed 1000 characters.");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => createInTransaction(transaction, organizationId, userId, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error("Work-order quantities changed concurrently. Refresh the work order and try again.");
}

export async function verifyWorkOrderInventoryGrnLine(
  organizationId: string,
  userId: string,
  grnId: string,
  lineId: string,
  input: { actualReceivedQuantity: number; approvedQuantity: number; locationId?: string; actorEmail?: string | null },
) {
  if (!grnId.trim() || !lineId.trim()) throw new Error("Select a Work Order GRN size line to verify.");
  const { actualReceivedQuantity, approvedQuantity } = input;
  for (const [label, quantity] of [
    ["Actual received", actualReceivedQuantity],
    ["Approved", approvedQuantity],
  ] as const) {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
      throw new Error(`${label} quantity must be a whole number of zero or more.`);
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const line = await transaction.workOrderInventoryGrnLine.findFirst({
          where: {
            id: lineId,
            grn_id: grnId,
            grn: { organization_id: organizationId },
          },
          include: {
            grn: {
              select: {
                id: true,
                grn_no: true,
                grn_date: true,
                status: true,
                submitted_by: true,
                workOrder: {
                  select: {
                    id: true,
                    work_order_no: true,
                    order_id: true,
                    order_no: true,
                    order: {
                      select: {
                        id: true,
                        organization_id: true,
                        entity_id: true,
                        article: true,
                        styleName: true,
                        brand: true,
                        buyer: true,
                        category: true,
                        colors: true,
                      },
                    },
                  },
                },
              },
            },
            workOrderSizeLine: {
              include: {
                bookingAssignments: {
                  where: { organization_id: organizationId },
                  include: {
                    bookingSizeLine: { include: { booking: { select: { id: true, booking_no: true } } } },
                    grnAllocations: { select: { allocated_quantity: true } },
                  },
                  orderBy: [{ created_at: "asc" }, { id: "asc" }],
                },
              },
            },
          },
        });
        if (!line) throw new Error("Work Order GRN size line was not found in this organization.");
        if (line.grn.status !== "PENDING_VERIFICATION" || line.verified_actual_quantity !== null) {
          throw new Error("This Work Order GRN size line has already been verified or is no longer pending.");
        }
        if (actualReceivedQuantity > line.received_quantity) {
          throw new Error("Actual received quantity cannot exceed the quantity submitted on this GRN line.");
        }
        if (approvedQuantity > actualReceivedQuantity) {
          throw new Error("Approved quantity cannot exceed actual received quantity.");
        }

        const assignments = line.workOrderSizeLine.bookingAssignments.map((assignment) => ({
          assignmentId: assignment.id,
          bookingNo: assignment.bookingSizeLine.booking.booking_no,
          size: assignment.bookingSizeLine.size,
          assignedQuantity: assignment.assigned_quantity,
          fulfilledQuantity: assignment.grnAllocations.reduce(
            (sum, allocation) => sum + allocation.allocated_quantity,
            0,
          ),
        }));
        const bookingSplit = allocateApprovedReceiptToBookingAssignments(approvedQuantity, assignments);
        const advanceBookedQuantity = bookingSplit.allocations.reduce((sum, allocation) => sum + allocation.allocatedQuantity, 0);
        const verificationSplit = calculateWorkOrderGrnVerificationSplit({
          actualReceivedQuantity,
          approvedQuantity,
          advanceBookedQuantity,
        });
        const submitter = await transaction.workspaceUser.findUnique({
          where: { id: line.grn.submitted_by },
          select: { email: true },
        });
        const hasStockToPost = approvedQuantity > 0;
        const order = line.grn.workOrder.order;
        if (order.organization_id !== organizationId) {
          throw new Error("The Work Order GRN order does not belong to this organization.");
        }
        const styleName = order.styleName?.trim() || order.article?.trim() || line.grn.workOrder.order_no;
        const stockSize = line.size?.trim() || line.buyer_size?.trim() || assignments[0]?.size || "Unspecified";
        if (hasStockToPost && !order.entity_id) {
          throw new Error("The order must have an organization entity before finished-goods stock can be posted.");
        }
        const stockLocation = hasStockToPost
          ? await transaction.masterLocation.findFirst({
            where: {
              id: input.locationId?.trim() ?? "",
              organization_id: organizationId,
              entity_id: order.entity_id ?? "",
              is_active: true,
            },
            select: { id: true, entity_id: true, entity: { select: { is_active: true } } },
          })
          : null;
        if (hasStockToPost && (!stockLocation || !stockLocation.entity.is_active)) {
          throw new Error("Select an active finished-goods location under an active order entity.");
        }

        const update = await transaction.workOrderInventoryGrnLine.updateMany({
          where: {
            id: line.id,
            grn_id: grnId,
            verified_actual_quantity: null,
            grn: { organization_id: organizationId, status: "PENDING_VERIFICATION" },
          },
          data: {
            verified_actual_quantity: actualReceivedQuantity,
            approved_quantity: approvedQuantity,
            rejected_quantity: verificationSplit.rejectedQuantity,
            advance_booked_quantity: advanceBookedQuantity,
            general_inventory_quantity: verificationSplit.generalInventoryQuantity,
          },
        });
        if (update.count !== 1) throw new Error("This Work Order GRN size line changed while being verified. Reload and try again.");

        const allocations = bookingSplit.allocations.filter((allocation) => allocation.allocatedQuantity > 0);
        const allocationRecords = [];
        for (const allocation of allocations) {
          const assignment = line.workOrderSizeLine.bookingAssignments.find(
            (candidate) => candidate.id === allocation.assignmentId,
          );
          if (!assignment) throw new Error("The booking assignment changed while this GRN was being verified.");
          const createdAllocation = await transaction.workOrderInventoryGrnBookingAllocation.create({
            data: {
              organization_id: organizationId,
              grn_line_id: line.id,
              booking_assignment_id: allocation.assignmentId,
              allocated_quantity: allocation.allocatedQuantity,
              created_by: userId,
            },
            select: { id: true },
          });
          allocationRecords.push({ ...allocation, assignment, grnAllocationId: createdAllocation.id });
        }

        const stockReceiptIds: { general: string | null; allocated: string[] } = {
          general: null,
          allocated: [],
        };
        if (hasStockToPost && stockLocation) {
          const commonReceiptDetails = {
            organization_id: organizationId,
            entity_id: stockLocation.entity_id,
            location_id: stockLocation.id,
            grn_id: line.grn.id,
            grn_line_id: line.id,
            work_order_id: line.grn.workOrder.id,
            order_id: line.grn.workOrder.order_id,
            grn_no: line.grn.grn_no,
            grn_date: line.grn.grn_date,
            work_order_no: line.grn.workOrder.work_order_no,
            order_no: line.grn.workOrder.order_no,
            article_no: order.article,
            style_name: styleName,
            brand: order.brand,
            buyer: order.buyer,
            product_category: order.category,
            colour: order.colors,
            size: stockSize,
            buyer_size: line.buyer_size,
            received_quantity: line.received_quantity,
            actual_received_quantity: actualReceivedQuantity,
            approved_quantity: approvedQuantity,
            rejected_quantity: verificationSplit.rejectedQuantity,
            created_by: submitter?.email || line.grn.submitted_by,
            verified_by: input.actorEmail?.trim() || userId,
          };
          if (verificationSplit.generalInventoryQuantity > 0) {
            const receipt = await transaction.finishedGoodsGeneralStockReceipt.create({
              data: {
                ...commonReceiptDetails,
                quantity_in: verificationSplit.generalInventoryQuantity,
                current_stock: verificationSplit.generalInventoryQuantity,
              },
              select: { id: true },
            });
            stockReceiptIds.general = receipt.id;
            await updateFinishedGoodsStockAggregate(
              transaction,
              organizationId,
              stockLocation.entity_id,
              stockLocation.id,
              styleName,
              stockSize,
              verificationSplit.generalInventoryQuantity,
              0,
            );
          }
          for (const allocation of allocationRecords) {
            const receipt = await transaction.finishedGoodsAllocatedStockReceipt.create({
              data: {
                ...commonReceiptDetails,
                grn_allocation_id: allocation.grnAllocationId,
                booking_id: allocation.assignment.bookingSizeLine.booking.id,
                booking_size_line_id: allocation.assignment.bookingSizeLine.id,
                booking_assignment_id: allocation.assignmentId,
                booking_no: allocation.bookingNo,
                quantity_in: allocation.allocatedQuantity,
                current_stock: allocation.allocatedQuantity,
              },
              select: { id: true },
            });
            stockReceiptIds.allocated.push(receipt.id);
            await updateFinishedGoodsStockAggregate(
              transaction,
              organizationId,
              stockLocation.entity_id,
              stockLocation.id,
              styleName,
              stockSize,
              allocation.allocatedQuantity,
              allocation.allocatedQuantity,
            );
          }
        }

        const pendingLines = await transaction.workOrderInventoryGrnLine.count({
          where: { grn_id: grnId, verified_actual_quantity: null },
        });
        const grnCompleted = pendingLines === 0;
        if (grnCompleted) {
          const grnUpdate = await transaction.workOrderInventoryGrn.updateMany({
            where: { id: grnId, organization_id: organizationId, status: "PENDING_VERIFICATION" },
            data: { status: "VERIFIED", verified_by: userId, verified_at: new Date() },
          });
          if (grnUpdate.count !== 1) throw new Error("This Work Order GRN changed while being verified. Reload and try again.");
        }

        await createAuditEvent({
          organizationId,
          userId,
          module: "Inventory Management",
          action: "VERIFY_WORK_ORDER_GRN_LINE",
          entityType: "WorkOrderInventoryGrnLine",
          entityId: line.id,
          details: {
            grn_no: line.grn.grn_no,
            size: line.size || line.buyer_size,
            actual_received_quantity: actualReceivedQuantity,
            approved_quantity: approvedQuantity,
            rejected_quantity: verificationSplit.rejectedQuantity,
            advance_booked_quantity: advanceBookedQuantity,
            general_inventory_quantity: verificationSplit.generalInventoryQuantity,
            stock_location_id: stockLocation?.id ?? null,
            general_stock_receipt_id: stockReceiptIds.general,
            allocated_stock_receipt_ids: stockReceiptIds.allocated,
            booking_allocations: allocations.map(({ assignmentId, bookingNo, allocatedQuantity }) => ({
              assignment_id: assignmentId,
              booking_no: bookingNo,
              quantity: allocatedQuantity,
            })),
            grn_completed: grnCompleted,
          },
        }, transaction);

        return {
          grnId,
          lineId: line.id,
          status: grnCompleted ? "VERIFIED" : "PENDING_VERIFICATION",
          actualReceivedQuantity,
          approvedQuantity,
          rejectedQuantity: verificationSplit.rejectedQuantity,
          advanceBookedQuantity,
          generalInventoryQuantity: verificationSplit.generalInventoryQuantity,
          stockLocationId: stockLocation?.id ?? null,
          stockReceiptIds,
          bookingAllocations: allocations,
          grnCompleted,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error("Work Order GRN verification changed concurrently. Reload and try again.");
}

async function updateFinishedGoodsStockAggregate(
  transaction: Database,
  organizationId: string,
  entityId: string,
  locationId: string,
  styleName: string,
  size: string,
  quantity: number,
  reservedQuantity: number,
) {
  const quantityOnHand = new Prisma.Decimal(quantity);
  const quantityReserved = new Prisma.Decimal(reservedQuantity);
  await transaction.finishedGoodsStock.upsert({
    where: {
      organization_id_style_name_size_location_id: {
        organization_id: organizationId,
        style_name: styleName,
        size,
        location_id: locationId,
      },
    },
    create: {
      organization_id: organizationId,
      entity_id: entityId,
      location_id: locationId,
      style_name: styleName,
      size,
      quantity_on_hand: quantityOnHand,
      quantity_reserved: quantityReserved,
    },
    update: {
      quantity_on_hand: { increment: quantityOnHand },
      quantity_reserved: { increment: quantityReserved },
    },
  });
}
