import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { listGeneralFinishedGoodsAvailability } from "@/lib/services/inventory/finished-goods-general-stock-allocation-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

type Database = Prisma.TransactionClient;

export type AdvanceBookingSizeInput = {
  size: string;
  quantity: number;
};

export type AdvanceBookingAssignmentInput = {
  bookingSizeLineId: string;
  assignedQuantity: number;
};

function normalizedSize(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase() ?? "";
}

function statusFor(assigned: number, booked: number) {
  if (assigned <= 0) return "UNASSIGNED";
  return assigned >= booked ? "FULLY_ASSIGNED" : "PARTIALLY_ASSIGNED";
}

function fulfillmentStatusFor(fulfilled: number, assigned: number) {
  if (fulfilled <= 0) return "UNFULFILLED";
  return fulfilled >= assigned ? "FULFILLED" : "PARTIALLY_FULFILLED";
}

const bookingInclude = {
  order: { select: { orderNo: true, sourceStatus: true, article: true } },
  quotationLines: {
    select: {
      quotation: {
        select: {
          quotation_no: true,
          customer: true,
          vendor: { select: { vendor: true } },
          parentQuotation: {
            select: {
              quotation_no: true,
              customer: true,
              vendor: { select: { vendor: true } },
            },
          },
        },
      },
    },
    take: 1,
  },
  sizeLines: {
    orderBy: { size: "asc" as const },
    include: {
      assignments: {
        include: {
          workOrderSizeLine: {
            include: { workOrder: { select: { id: true, work_order_no: true } } },
          },
          grnAllocations: { select: { allocated_quantity: true } },
        },
        orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
      },
    },
  },
};

function mapBooking(
  record: Prisma.AdvanceBookingGetPayload<{ include: typeof bookingInclude }>,
  isLegacyArticleBased = false,
) {
  const sizes = record.sizeLines.map((line) => {
    const assignedQuantity = line.assignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0);
    const fulfilledQuantity = line.assignments.reduce(
      (sum, assignment) => sum + assignment.grnAllocations.reduce((lineSum, allocation) => lineSum + allocation.allocated_quantity, 0),
      0,
    );
    return {
      id: line.id,
      size: line.size,
      bookedQuantity: line.booked_quantity,
      assignedQuantity,
      unassignedQuantity: Math.max(line.booked_quantity - assignedQuantity, 0),
      fulfilledQuantity,
      generalInventoryAvailableQuantity: 0,
      assignmentStatus: statusFor(assignedQuantity, line.booked_quantity),
      fulfillmentStatus: fulfillmentStatusFor(fulfilledQuantity, assignedQuantity),
      assignments: line.assignments.map((assignment) => {
        const fulfilled = assignment.grnAllocations.reduce((sum, allocation) => sum + allocation.allocated_quantity, 0);
        return {
          id: assignment.id,
          workOrderId: assignment.workOrderSizeLine.workOrder.id,
          workOrderNo: assignment.workOrderSizeLine.workOrder.work_order_no,
          workOrderSizeLineId: assignment.work_order_size_line_id,
          assignedQuantity: assignment.assigned_quantity,
          fulfilledQuantity: fulfilled,
          remainingQuantity: Math.max(assignment.assigned_quantity - fulfilled, 0),
        };
      }),
    };
  });
  const totalBooked = sizes.reduce((sum, line) => sum + line.bookedQuantity, 0);
  const totalAssigned = sizes.reduce((sum, line) => sum + line.assignedQuantity, 0);
  const totalFulfilled = sizes.reduce((sum, line) => sum + line.fulfilledQuantity, 0);
  return {
    id: record.id,
    bookingId: record.booking_no,
    orderId: record.order_id,
    orderNo: record.order.orderNo,
    orderSourceStatus: record.order.sourceStatus === "ARTICLE_BASED" || isLegacyArticleBased
      ? "ARTICLE_BASED"
      : "DIRECT",
    vendorId: record.vendor_id,
    customer: record.customer ?? "",
    quotationNo: record.quotationLines[0]?.quotation.quotation_no ?? null,
    salesOrderNo: record.quotationLines[0]?.quotation.parentQuotation?.quotation_no ?? null,
    quotationVendor: record.quotationLines[0]?.quotation.vendor?.vendor ?? record.quotationLines[0]?.quotation.customer ?? null,
    masterQuotationVendor: record.quotationLines[0]?.quotation.parentQuotation?.vendor?.vendor ??
      record.quotationLines[0]?.quotation.parentQuotation?.customer ?? null,
    brand: record.brand ?? "",
    styleName: record.style_name ?? "",
    deliveryDate: record.delivery_date?.toISOString().slice(0, 10) ?? "",
    createdAt: record.created_at.toISOString(),
    totalBooked,
    totalAssigned,
    totalAllocated: totalAssigned,
    totalUnassigned: Math.max(totalBooked - totalAssigned, 0),
    totalFulfilled,
    assignmentStatus: statusFor(totalAssigned, totalBooked),
    fulfillmentStatus: fulfillmentStatusFor(totalFulfilled, totalAssigned),
    sizes,
  };
}

async function getLegacyArticleBasedOrderIds(
  organizationId: string,
  records: Array<Prisma.AdvanceBookingGetPayload<{ include: typeof bookingInclude }>>,
) {
  const candidates = records.filter((record) =>
    record.order.sourceStatus !== "ARTICLE_BASED" && Boolean(record.order.article?.trim()),
  );
  if (candidates.length === 0) return new Set<string>();
  const articleNames = [...new Set(candidates.map((record) => record.order.article!.trim()))];
  const masterArticles = await prisma.masterArticle.findMany({
    where: { organization_id: organizationId, article: { in: articleNames } },
    select: { article: true },
  });
  const masterArticleNames = new Set(masterArticles.map((article) => article.article.trim().toLocaleUpperCase()));
  return new Set(candidates
    .filter((record) => masterArticleNames.has(record.order.article!.trim().toLocaleUpperCase()))
    .map((record) => record.order_id));
}

function encodeBookingCursor(value: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeBookingCursor(value: string | undefined) {
  if (!value) return null;
  if (value.length > 512) {
    throw new Error("The booking page cursor is invalid. Refresh the booking register.");
  }
  let decoded: { createdAt?: unknown; id?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
  } catch {
    throw new Error("The booking page cursor is invalid. Refresh the booking register.");
  }
  if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string" || !decoded.id.trim()) {
    throw new Error("The booking page cursor is invalid. Refresh the booking register.");
  }
  const createdAt = new Date(decoded.createdAt);
  if (!Number.isFinite(createdAt.getTime())) {
    throw new Error("The booking page cursor is invalid. Refresh the booking register.");
  }
  return { createdAt, id: decoded.id };
}

export async function listAdvanceBookings(
  organizationId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const requestedLimit = options.limit ?? 100;
  const take = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100, 1), 200);
  const cursor = decodeBookingCursor(options.cursor);
  const rows = await prisma.advanceBooking.findMany({
    where: {
      organization_id: organizationId,
      ...(cursor
        ? {
            OR: [
              { created_at: { lt: cursor.createdAt } },
              { created_at: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    include: bookingInclude,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const hasNextPage = rows.length > take;
  const pageRows = hasNextPage ? rows.slice(0, take) : rows;
  const lastRow = pageRows.at(-1);
  const legacyArticleBasedOrderIds = await getLegacyArticleBasedOrderIds(organizationId, pageRows);
  const generalStockAvailability = await listGeneralFinishedGoodsAvailability(
    organizationId,
    pageRows.map((row) => row.order_id),
  );
  return {
    bookings: pageRows.map((record) => {
      const booking = mapBooking(record, legacyArticleBasedOrderIds.has(record.order_id));
      const availabilityBySize = generalStockAvailability.get(booking.orderId);
      return {
        ...booking,
        sizes: booking.sizes.map((line) => ({
          ...line,
          generalInventoryAvailableQuantity: availabilityBySize?.get(normalizedSize(line.size)) ?? 0,
        })),
      };
    }),
    nextCursor: hasNextPage && lastRow
      ? encodeBookingCursor({ createdAt: lastRow.created_at.toISOString(), id: lastRow.id })
      : null,
  };
}

export async function getAdvanceBookingById(organizationId: string, bookingId: string) {
  const record = await prisma.advanceBooking.findFirst({
    where: { id: bookingId, organization_id: organizationId },
    include: bookingInclude,
  });
  if (!record) throw new Error("Advance booking was not found in this organization.");
  const legacyArticleBasedOrderIds = await getLegacyArticleBasedOrderIds(organizationId, [record]);
  return { booking: mapBooking(record, legacyArticleBasedOrderIds.has(record.order_id)) };
}

async function createBookingInTransaction(
  transaction: Database,
  organizationId: string,
  userId: string,
  input: {
    orderId: string;
    vendorId: string | null;
    contactId: string | null;
    sizes: AdvanceBookingSizeInput[];
  },
) {
  if (input.vendorId && input.contactId) {
    throw new Error("Select an End Customer from either Contact Master or Vendor Master, not both.");
  }
  const order = await transaction.merchandisingOrder.findFirst({
    where: { id: input.orderId, organization_id: organizationId },
    select: {
      id: true,
      orderNo: true,
      sourceStatus: true,
      article: true,
      brand: true,
      styleName: true,
      deliveryDate: true,
      finishedGoods: { select: { size: true, buyerSize: true, totalQty: true, beforeExcessQty: true } },
    },
  });
  if (!order) throw new Error("The selected order was not found in this organization.");
  const legacyArticle = order.sourceStatus !== "ARTICLE_BASED" && order.article?.trim()
    ? await transaction.masterArticle.findFirst({
        where: { organization_id: organizationId, article: order.article.trim() },
        select: { id: true },
      })
    : null;
  const contact = input.contactId
    ? await transaction.contact.findFirst({
      where: { id: input.contactId, organization_id: organizationId },
      select: { id: true, legal_name: true, display_name: true },
    })
    : null;
  if (input.contactId && !contact) throw new Error("Select a contact from this organization's Contact Master.");
  const vendor = input.vendorId
    ? await transaction.masterVendor.findFirst({
      where: { id: input.vendorId, organization_id: organizationId },
      select: { id: true, vendor: true },
    })
    : contact
      ? await transaction.masterVendor.findFirst({
        where: { organization_id: organizationId, contact_id: contact.id },
        select: { id: true, vendor: true },
      })
      : null;
  if (input.vendorId && !vendor) throw new Error("Select an End Customer from this organization's Vendor Master.");

  const capacityBySize = new Map<string, number>();
  for (const row of order.finishedGoods) {
    const size = normalizedSize(row.size || row.buyerSize);
    if (!size) continue;
    capacityBySize.set(size, (capacityBySize.get(size) ?? 0) + (row.totalQty ?? row.beforeExcessQty ?? 0));
  }
  const existing = await transaction.advanceBookingSizeLine.findMany({
    where: { organization_id: organizationId, booking: { order_id: order.id } },
    select: { size: true, booked_quantity: true },
  });
  const bookedBySize = new Map<string, number>();
  for (const line of existing) {
    const size = normalizedSize(line.size);
    bookedBySize.set(size, (bookedBySize.get(size) ?? 0) + line.booked_quantity);
  }

  const seen = new Set<string>();
  const lines = input.sizes.map((line) => {
    const size = normalizedSize(line.size);
    if (!size || size.length > 100 || seen.has(size)) throw new Error("Each valid finished-goods size must be submitted once.");
    seen.add(size);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0 || line.quantity > 2147483647) {
      throw new Error(`Booking quantity for size ${size} must be a whole number of zero or more.`);
    }
    const capacity = capacityBySize.get(size);
    if (capacity === undefined) throw new Error(`Size ${size} does not belong to the selected order.`);
    const available = Math.max(capacity - (bookedBySize.get(size) ?? 0), 0);
    const actualIncrease = Math.max(line.quantity - available, 0);
    return { size, booked_quantity: line.quantity, orderIncreaseQuantity: actualIncrease };
  }).filter((line) => line.booked_quantity > 0);
  if (lines.length === 0) throw new Error("Enter a positive booking quantity for at least one size.");

  const booking = await transaction.advanceBooking.create({
    data: {
      organization_id: organizationId,
      order_id: order.id,
      vendor_id: vendor?.id ?? null,
      booking_no: await reserveProcurementDocumentNumber(organizationId, "ADVANCE_BOOKING", transaction),
      customer: vendor?.vendor ?? (contact?.display_name || contact?.legal_name) ?? null,
      brand: order.brand,
      style_name: order.styleName,
      delivery_date: order.deliveryDate,
      created_by: userId,
      sizeLines: {
        create: lines.map(({ size, booked_quantity }) => ({ size, booked_quantity })),
      },
    },
    select: {
      id: true,
      booking_no: true,
      order_id: true,
      vendor_id: true,
      customer: true,
      brand: true,
      style_name: true,
      delivery_date: true,
      created_at: true,
      order: { select: { orderNo: true, sourceStatus: true } },
      sizeLines: {
        orderBy: { size: "asc" },
        select: { id: true, size: true, booked_quantity: true },
      },
    },
  });
  const totalBooked = booking.sizeLines.reduce((sum, line) => sum + line.booked_quantity, 0);
  await createAuditEvent({
    organizationId,
    userId,
    module: "Distribution",
    action: "CREATE_ADVANCE_BOOKING",
    entityType: "AdvanceBooking",
    entityId: booking.id,
    details: {
      booking_no: booking.booking_no,
      order_no: order.orderNo,
      total_quantity: totalBooked,
      total_order_quantity_increase: lines.reduce((sum, line) => sum + line.orderIncreaseQuantity, 0),
      order_quantity_increases: lines
        .filter((line) => line.orderIncreaseQuantity > 0)
        .map((line) => ({ size: line.size, quantity: line.orderIncreaseQuantity })),
    },
  }, transaction);
  return {
    id: booking.id,
    bookingId: booking.booking_no,
    orderId: booking.order_id,
    orderNo: booking.order.orderNo,
    orderSourceStatus: booking.order.sourceStatus === "ARTICLE_BASED" || Boolean(legacyArticle)
      ? "ARTICLE_BASED"
      : "DIRECT",
    vendorId: booking.vendor_id,
    customer: booking.customer ?? "",
    quotationNo: null,
    salesOrderNo: null,
    quotationVendor: null,
    masterQuotationVendor: null,
    brand: booking.brand ?? "",
    styleName: booking.style_name ?? "",
    deliveryDate: booking.delivery_date?.toISOString().slice(0, 10) ?? "",
    createdAt: booking.created_at.toISOString(),
    totalBooked,
    totalAssigned: 0,
    totalAllocated: 0,
    totalUnassigned: totalBooked,
    totalFulfilled: 0,
    assignmentStatus: statusFor(0, totalBooked),
    fulfillmentStatus: fulfillmentStatusFor(0, 0),
    sizes: booking.sizeLines.map((line) => ({
      id: line.id,
      size: line.size,
      bookedQuantity: line.booked_quantity,
      assignedQuantity: 0,
      unassignedQuantity: line.booked_quantity,
      fulfilledQuantity: 0,
      generalInventoryAvailableQuantity: 0,
      assignmentStatus: statusFor(0, line.booked_quantity),
      fulfillmentStatus: fulfillmentStatusFor(0, 0),
      assignments: [],
    })),
  };
}

export async function createAdvanceBooking(
  organizationId: string,
  userId: string,
  input: { orderId: string; vendorId: string | null; contactId?: string | null; sizes: AdvanceBookingSizeInput[] },
) {
  if (!input.orderId.trim()) throw new Error("Select an order.");
  const normalizedInput = {
    ...input,
    vendorId: input.vendorId?.trim() || null,
    contactId: input.contactId?.trim() || null,
  };
  if (!Array.isArray(input.sizes) || input.sizes.length === 0 || input.sizes.length > 200) {
    throw new Error("Submit valid quantities for the order sizes.");
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => createBookingInTransaction(transaction, organizationId, userId, normalizedInput),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Advance booking changed concurrently. Reload and try again.");
}

export async function deleteAdvanceBookings(
  organizationId: string,
  userId: string,
  bookingIds: string[],
) {
  if (bookingIds.length === 0 || bookingIds.length > 100) {
    throw new Error("Select between one and 100 advance bookings to delete.");
  }
  if (bookingIds.some((id) => !id.trim()) || new Set(bookingIds).size !== bookingIds.length) {
    throw new Error("Each advance booking can only be selected once.");
  }

  return prisma.$transaction(async (transaction) => {
    const bookings = await transaction.advanceBooking.findMany({
      where: { organization_id: organizationId, id: { in: bookingIds } },
      include: {
        sizeLines: {
          include: {
            assignments: {
              select: {
                id: true,
                grnAllocations: { select: { id: true } },
                finishedGoodsStockReceipts: { select: { id: true } },
              },
            },
          },
        },
        quotationLines: { select: { quotation: { select: { quotation_no: true } } } },
      },
    });
    if (bookings.length !== bookingIds.length) {
      throw new Error("One or more selected bookings are unavailable in this organization.");
    }

    for (const booking of bookings) {
      if (booking.quotationLines.length > 0) {
        throw new Error(`Delete quotation ${booking.quotationLines[0].quotation.quotation_no} before deleting booking ${booking.booking_no}.`);
      }
      const hasFulfilledAssignment = booking.sizeLines.some((line) =>
        line.assignments.some((assignment) =>
          assignment.grnAllocations.length > 0 || assignment.finishedGoodsStockReceipts.length > 0,
        ),
      );
      if (hasFulfilledAssignment) {
        throw new Error(`Booking ${booking.booking_no} has fulfilled work-order assignments. Reverse or remove its inventory fulfillment before deleting the booking.`);
      }
    }

    const sizeLineIds = bookings.flatMap((booking) => booking.sizeLines.map((line) => line.id));
    const assignmentIds = bookings.flatMap((booking) =>
      booking.sizeLines.flatMap((line) => line.assignments.map((assignment) => assignment.id)),
    );
    if (assignmentIds.length > 0) {
      const removedAssignments = await transaction.advanceBookingWorkOrderAssignment.deleteMany({
        where: {
          organization_id: organizationId,
          id: { in: assignmentIds },
          booking_size_line_id: { in: sizeLineIds },
        },
      });
      if (removedAssignments.count !== assignmentIds.length) {
        throw new Error("Work-order assignments changed while deleting the bookings. Reload and try again.");
      }
    }

    const deleted = await transaction.advanceBooking.deleteMany({
      where: { organization_id: organizationId, id: { in: bookingIds } },
    });
    if (deleted.count !== bookingIds.length) {
      throw new Error("Selected bookings changed while deleting. Reload and try again.");
    }
    for (const booking of bookings) {
      await createAuditEvent({
        organizationId,
        userId,
        module: "Distribution",
        action: "DELETE_ADVANCE_BOOKING",
        entityType: "AdvanceBooking",
        entityId: booking.id,
        details: {
          booking_no: booking.booking_no,
          size_count: booking.sizeLines.length,
          total_quantity: booking.sizeLines.reduce((sum, line) => sum + line.booked_quantity, 0),
          unassigned_work_order_count: booking.sizeLines.reduce(
            (sum, line) => sum + line.assignments.length,
            0,
          ),
        },
      }, transaction);
    }
    return { deletedBookingNos: bookings.map((booking) => booking.booking_no) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function listAssignableWorkOrders(organizationId: string, bookingId: string) {
  const booking = await prisma.advanceBooking.findFirst({
    where: { id: bookingId, organization_id: organizationId },
    select: { id: true, order_id: true },
  });
  if (!booking) throw new Error("Advance booking was not found in this organization.");
  const workOrders = await prisma.factoryWorkOrder.findMany({
    where: { organization_id: organizationId, order_id: booking.order_id },
    include: {
      sizeLines: {
        include: {
          bookingAssignments: {
            where: { organization_id: organizationId },
            select: { assigned_quantity: true },
          },
        },
      },
    },
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }],
    take: 200,
  });
  return {
    workOrders: workOrders.map((workOrder) => ({
      id: workOrder.id,
      workOrderNo: workOrder.work_order_no,
      status: workOrder.status,
      sizeLines: workOrder.sizeLines.map((line) => ({
        id: line.id,
        size: line.size || line.buyer_size || "Unspecified",
        quantity: line.quantity,
        assignedQuantity: line.bookingAssignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0),
        availableQuantity: Math.max(line.quantity - line.bookingAssignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0), 0),
      })),
    })),
  };
}

export async function assignBookingInTransaction(
  transaction: Database,
  organizationId: string,
  userId: string,
  bookingId: string,
  input: { workOrderId: string; lines: AdvanceBookingAssignmentInput[] },
) {
  const booking = await transaction.advanceBooking.findFirst({
    where: { id: bookingId, organization_id: organizationId },
    include: {
      quotationLines: {
        select: {
          quotation: {
            select: { parentQuotation: { select: { quotation_no: true } } },
          },
        },
        take: 1,
      },
      sizeLines: { include: { assignments: { select: { assigned_quantity: true } } } },
    },
  });
  if (!booking) throw new Error("Advance booking was not found in this organization.");
  if (!booking.quotationLines[0]?.quotation.parentQuotation) {
    throw new Error("Create a Sales Order before assigning this advance booking to a work order.");
  }
  const workOrder = await transaction.factoryWorkOrder.findFirst({
    where: { id: input.workOrderId, organization_id: organizationId, order_id: booking.order_id },
    include: { sizeLines: { include: { bookingAssignments: { select: { assigned_quantity: true } } } } },
  });
  if (!workOrder) throw new Error("Select a work order linked to this advance booking's order.");
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 200) {
    throw new Error("Enter at least one size quantity to assign.");
  }

  const bookingLines = new Map(booking.sizeLines.map((line) => [line.id, line]));
  const seen = new Set<string>();
  const workOrderLineBySize = new Map(
    workOrder.sizeLines.map((line) => [
      normalizedSize(line.size || line.buyer_size),
      line,
    ]),
  );
  const assignmentPairs: Array<{ bookingSizeLineId: string; workOrderSizeLineId: string }> = [];
  const validatedLines: Array<{
    bookingLine: (typeof booking.sizeLines)[number];
    workOrderLine: (typeof workOrder.sizeLines)[number] | null;
    quantity: number;
  }> = [];
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.assignedQuantity) || line.assignedQuantity < 0 || line.assignedQuantity > 2147483647) {
      throw new Error("Assigned quantities must be whole numbers greater than or equal to zero.");
    }
    if (seen.has(line.bookingSizeLineId)) throw new Error("Each booking size must be assigned only once per request.");
    seen.add(line.bookingSizeLineId);
    const bookingLine = bookingLines.get(line.bookingSizeLineId);
    if (!bookingLine) throw new Error("A selected booking size does not belong to this booking.");
    const workOrderLine = workOrderLineBySize.get(normalizedSize(bookingLine.size)) ?? null;
    if (!workOrderLine) {
      if (line.assignedQuantity > 0) throw new Error(`Work order ${workOrder.work_order_no} has no ${bookingLine.size} size line.`);
      validatedLines.push({ bookingLine, workOrderLine: null, quantity: 0 });
      continue;
    }
    const alreadyAssigned = bookingLine.assignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0);
    const bookingRemaining = Math.max(bookingLine.booked_quantity - alreadyAssigned, 0);
    const workOrderAlreadyAssigned = workOrderLine.bookingAssignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0);
    const workOrderRemaining = Math.max(workOrderLine.quantity - workOrderAlreadyAssigned, 0);
    const quantity = line.assignedQuantity;
    if (quantity > bookingRemaining) {
      throw new Error(`Size ${bookingLine.size} quantity exceeds this booking's unassigned balance of ${bookingRemaining}.`);
    }
    if (quantity > workOrderRemaining) {
      throw new Error(`Size ${bookingLine.size} quantity exceeds work order ${workOrder.work_order_no}'s available assignment balance of ${workOrderRemaining}.`);
    }
    if (quantity > 0) {
      assignmentPairs.push({
        bookingSizeLineId: bookingLine.id,
        workOrderSizeLineId: workOrderLine.id,
      });
    }
    validatedLines.push({ bookingLine, workOrderLine, quantity });
  }

  const existingAssignments = assignmentPairs.length > 0
    ? await transaction.advanceBookingWorkOrderAssignment.findMany({
        where: {
          organization_id: organizationId,
          OR: assignmentPairs.map((pair) => ({
            booking_size_line_id: pair.bookingSizeLineId,
            work_order_size_line_id: pair.workOrderSizeLineId,
          })),
        },
        select: {
          booking_size_line_id: true,
          work_order_size_line_id: true,
          assigned_quantity: true,
        },
      })
    : [];
  const existingAssignmentByPair = new Map(
    existingAssignments.map((assignment) => [
      JSON.stringify([assignment.booking_size_line_id, assignment.work_order_size_line_id]),
      assignment,
    ]),
  );
  const normalized = validatedLines.map((line) => ({
    ...line,
    existingForPair: line.workOrderLine
      ? existingAssignmentByPair.get(JSON.stringify([line.bookingLine.id, line.workOrderLine.id])) ?? null
      : null,
  }));

  const positiveLines = normalized.filter((line) => line.quantity > 0 && line.workOrderLine);
  if (positiveLines.length === 0) throw new Error("Enter a positive assignment quantity for at least one size.");
  for (const line of positiveLines) {
    const existing = line.existingForPair;
    if (existing) {
      await transaction.advanceBookingWorkOrderAssignment.updateMany({
        where: {
          organization_id: organizationId,
          booking_size_line_id: line.bookingLine.id,
          work_order_size_line_id: line.workOrderLine!.id,
        },
        data: { assigned_quantity: { increment: line.quantity } },
      });
    } else {
      await transaction.advanceBookingWorkOrderAssignment.create({
        data: {
          organization_id: organizationId,
          booking_size_line_id: line.bookingLine.id,
          work_order_id: workOrder.id,
          work_order_size_line_id: line.workOrderLine!.id,
          assigned_quantity: line.quantity,
          created_by: userId,
        },
      });
    }
  }
  await createAuditEvent({
    organizationId,
    userId,
    module: "Distribution",
    action: "ASSIGN_ADVANCE_BOOKING_TO_WORK_ORDER",
    entityType: "AdvanceBooking",
    entityId: booking.id,
    details: {
      booking_no: booking.booking_no,
      work_order_no: workOrder.work_order_no,
      assigned_lines: positiveLines.map((line) => ({
        size: line.bookingLine.size,
        quantity: line.quantity,
      })),
    },
  }, transaction);
  return { bookingId: booking.id, workOrderId: workOrder.id };
}

export async function assignAdvanceBookingToWorkOrder(
  organizationId: string,
  userId: string,
  bookingId: string,
  input: { workOrderId: string; lines: AdvanceBookingAssignmentInput[] },
) {
  if (!input.workOrderId.trim()) throw new Error("Select a work order.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => assignBookingInTransaction(transaction, organizationId, userId, bookingId, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Booking or work-order balances changed concurrently. Reload and try again.");
}
