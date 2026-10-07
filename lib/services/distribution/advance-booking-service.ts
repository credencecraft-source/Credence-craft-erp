import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
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
  order: { select: { orderNo: true } },
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

function mapBooking(record: Prisma.AdvanceBookingGetPayload<{ include: typeof bookingInclude }>) {
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
    vendorId: record.vendor_id,
    customer: record.customer,
    brand: record.brand ?? "",
    styleName: record.style_name ?? "",
    deliveryDate: record.delivery_date?.toISOString().slice(0, 10) ?? "",
    createdAt: record.created_at.toISOString(),
    totalBooked,
    totalAssigned,
    totalUnassigned: Math.max(totalBooked - totalAssigned, 0),
    totalFulfilled,
    assignmentStatus: statusFor(totalAssigned, totalBooked),
    fulfillmentStatus: fulfillmentStatusFor(totalFulfilled, totalAssigned),
    sizes,
  };
}

export async function listAdvanceBookings(organizationId: string) {
  const rows = await prisma.advanceBooking.findMany({
    where: { organization_id: organizationId },
    include: bookingInclude,
    orderBy: [{ created_at: "desc" }, { booking_no: "desc" }],
    take: 500,
  });
  return { bookings: rows.map(mapBooking) };
}

async function createBookingInTransaction(
  transaction: Database,
  organizationId: string,
  userId: string,
  input: {
    orderId: string;
    vendorId: string;
    sizes: AdvanceBookingSizeInput[];
  },
) {
  const order = await transaction.merchandisingOrder.findFirst({
    where: { id: input.orderId, organization_id: organizationId },
    select: {
      id: true,
      orderNo: true,
      brand: true,
      styleName: true,
      deliveryDate: true,
      finishedGoods: { select: { size: true, buyerSize: true, totalQty: true, beforeExcessQty: true } },
    },
  });
  if (!order) throw new Error("The selected order was not found in this organization.");
  const vendor = await transaction.masterVendor.findFirst({
    where: { id: input.vendorId, organization_id: organizationId, is_active: true },
    select: { id: true, vendor: true },
  });
  if (!vendor) throw new Error("Select an active customer from Vendor Master.");

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
    if (line.quantity > available) throw new Error(`Booking quantity for size ${size} exceeds the remaining order balance of ${available}.`);
    return { size, booked_quantity: line.quantity };
  }).filter((line) => line.booked_quantity > 0);
  if (lines.length === 0) throw new Error("Enter a positive booking quantity for at least one size.");

  const booking = await transaction.advanceBooking.create({
    data: {
      organization_id: organizationId,
      order_id: order.id,
      vendor_id: vendor.id,
      booking_no: await reserveProcurementDocumentNumber(organizationId, "ADVANCE_BOOKING", transaction),
      customer: vendor.vendor,
      brand: order.brand,
      style_name: order.styleName,
      delivery_date: order.deliveryDate,
      created_by: userId,
      sizeLines: { create: lines },
    },
    include: bookingInclude,
  });
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
      total_quantity: lines.reduce((sum, line) => sum + line.booked_quantity, 0),
    },
  }, transaction);
  return mapBooking(booking);
}

export async function createAdvanceBooking(
  organizationId: string,
  userId: string,
  input: { orderId: string; vendorId: string; sizes: AdvanceBookingSizeInput[] },
) {
  if (!input.orderId.trim() || !input.vendorId.trim()) throw new Error("Select an order and customer.");
  if (!Array.isArray(input.sizes) || input.sizes.length === 0 || input.sizes.length > 200) {
    throw new Error("Submit valid quantities for the order sizes.");
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => createBookingInTransaction(transaction, organizationId, userId, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Advance booking changed concurrently. Reload and try again.");
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

async function assignBookingInTransaction(
  transaction: Database,
  organizationId: string,
  userId: string,
  bookingId: string,
  input: { workOrderId: string; lines: AdvanceBookingAssignmentInput[] },
) {
  const booking = await transaction.advanceBooking.findFirst({
    where: { id: bookingId, organization_id: organizationId },
    include: { sizeLines: { include: { assignments: { select: { assigned_quantity: true } } } } },
  });
  if (!booking) throw new Error("Advance booking was not found in this organization.");
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
  const normalized: Array<{
    bookingLine: (typeof booking.sizeLines)[number];
    workOrderLine: (typeof workOrder.sizeLines)[number] | null;
    quantity: number;
    existingForPair?: { assigned_quantity: number } | null;
  }> = [];
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.assignedQuantity) || line.assignedQuantity < 0 || line.assignedQuantity > 2147483647) {
      throw new Error("Assigned quantities must be whole numbers greater than or equal to zero.");
    }
    if (seen.has(line.bookingSizeLineId)) throw new Error("Each booking size must be assigned only once per request.");
    seen.add(line.bookingSizeLineId);
    const bookingLine = bookingLines.get(line.bookingSizeLineId);
    if (!bookingLine) throw new Error("A selected booking size does not belong to this booking.");
    const workOrderLine = workOrder.sizeLines.find(
      (candidate) => normalizedSize(candidate.size || candidate.buyer_size) === normalizedSize(bookingLine.size),
    );
    if (!workOrderLine) {
      if (line.assignedQuantity > 0) throw new Error(`Work order ${workOrder.work_order_no} has no ${bookingLine.size} size line.`);
      normalized.push({ bookingLine, workOrderLine: null, quantity: 0 });
      continue;
    }
    const existingForPair = await transaction.advanceBookingWorkOrderAssignment.findFirst({
      where: {
        organization_id: organizationId,
        booking_size_line_id: bookingLine.id,
        work_order_size_line_id: workOrderLine.id,
      },
      select: { assigned_quantity: true },
    });
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
    normalized.push({ bookingLine, workOrderLine, quantity, existingForPair });
  }

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
