import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import {
  assignBookingInTransaction,
  assignBookingsInTransaction,
  getAdvanceBookingAssignmentSummary,
  type AdvanceBookingAssignmentInput,
  type AdvanceBookingAssignmentRequest,
} from "@/lib/services/distribution/advance-booking-service";
import {
  allocateBookingFromGeneralStockInTransaction,
  listGeneralFinishedGoodsAvailability,
  loadGeneralStockAllocationContext,
  type GeneralStockAllocationLineInput,
} from "@/lib/services/inventory/finished-goods-general-stock-allocation-service";

type Database = Prisma.TransactionClient;
type AllocationMode = "GENERAL" | "PRODUCTION";
type AllocationWorkOrder = {
  id: string;
  order_id: string;
  work_order_no: string;
  status: string;
  sizeLines: Array<{
    id: string;
    size: string | null;
    buyer_size: string | null;
    quantity: number;
    assigned_quantity: number;
  }>;
};

const salesOrderBookingInclude = {
  order: { select: { id: true, orderNo: true, sourceStatus: true, article: true } },
  sizeLines: {
    orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
  },
};

function normalizedSize(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase() ?? "";
}

async function getSalesOrderBookings(
  database: Database,
  organizationId: string,
  salesOrderId: string,
) {
  const salesOrder = await database.distributionQuotation.findFirst({
    where: { id: salesOrderId, organization_id: organizationId, mode: "MASTER" },
    select: { id: true, quotation_no: true },
  });
  if (!salesOrder) throw new Error("The Sales Order was not found in this organization.");

  const bookings = await database.advanceBooking.findMany({
    where: {
      organization_id: organizationId,
      quotationLines: {
        some: {
          organization_id: organizationId,
          quotation: {
            is: { organization_id: organizationId, parent_quotation_id: salesOrderId },
          },
        },
      },
    },
    include: {
      ...salesOrderBookingInclude,
      sizeLines: {
        ...salesOrderBookingInclude.sizeLines,
        include: {
          assignments: {
            where: { organization_id: organizationId },
            select: {
              assigned_quantity: true,
              grnAllocations: {
                where: { organization_id: organizationId },
                select: { allocated_quantity: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });

  return { salesOrder, bookings };
}

async function getSalesOrderBookingHeaders(
  database: Database,
  organizationId: string,
  salesOrderId: string,
) {
  const salesOrder = await database.distributionQuotation.findFirst({
    where: { id: salesOrderId, organization_id: organizationId, mode: "MASTER" },
    select: { id: true, quotation_no: true },
  });
  if (!salesOrder) throw new Error("The Sales Order was not found in this organization.");
  const bookings = await database.advanceBooking.findMany({
    where: {
      organization_id: organizationId,
      quotationLines: {
        some: {
          organization_id: organizationId,
          quotation: {
            is: { organization_id: organizationId, parent_quotation_id: salesOrderId },
          },
        },
      },
    },
    select: {
      id: true,
      order_id: true,
      order: { select: { id: true, orderNo: true, sourceStatus: true, article: true } },
      sizeLines: {
        select: { id: true, size: true, booked_quantity: true },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  return { salesOrder, bookings };
}

function summarizeOrderBookings(
  bookings: Awaited<ReturnType<typeof getSalesOrderBookingHeaders>>["bookings"],
  workOrders: AllocationWorkOrder[],
  generalStock: Map<string, Map<string, number>>,
  assignedBySizeLineId: Map<string, number>,
  fulfilledBySizeLineId: Map<string, number>,
) {
  const workOrdersByOrderId = new Map<string, AllocationWorkOrder[]>();
  for (const workOrder of workOrders) {
    const orderWorkOrders = workOrdersByOrderId.get(workOrder.order_id) ?? [];
    orderWorkOrders.push(workOrder);
    workOrdersByOrderId.set(workOrder.order_id, orderWorkOrders);
  }
  const groups = new Map<string, {
    orderId: string;
    orderNo: string;
    bookingCount: number;
    totalBooked: number;
    totalUnassigned: number;
    sizes: Map<string, {
      size: string;
      bookedQuantity: number;
      assignedQuantity: number;
      unassignedQuantity: number;
      allocatableQuantity: number;
    }>;
  }>();
  for (const booking of bookings) {
    let group = groups.get(booking.order.id);
    if (!group) {
      group = {
        orderId: booking.order.id,
        orderNo: booking.order.orderNo,
        bookingCount: 0,
        totalBooked: 0,
        totalUnassigned: 0,
        sizes: new Map(),
      };
      groups.set(booking.order.id, group);
    }
    group.bookingCount += 1;
    for (const line of booking.sizeLines) {
      const key = normalizedSize(line.size);
      if (!key) continue;
      const assignedQuantity = assignedBySizeLineId.get(line.id) ?? 0;
      const fulfilledQuantity = fulfilledBySizeLineId.get(line.id) ?? 0;
      const bookedQuantity = line.booked_quantity;
      const unassignedQuantity = Math.max(bookedQuantity - assignedQuantity, 0);
      const allocatableQuantity = Math.max(bookedQuantity - fulfilledQuantity, 0);
      group.totalBooked += bookedQuantity;
      group.totalUnassigned += unassignedQuantity;
      const size = group.sizes.get(key);
      if (size) {
        size.bookedQuantity += bookedQuantity;
        size.assignedQuantity += assignedQuantity;
        size.unassignedQuantity += unassignedQuantity;
        size.allocatableQuantity += allocatableQuantity;
      } else {
        group.sizes.set(key, { size: line.size, bookedQuantity, assignedQuantity, unassignedQuantity, allocatableQuantity });
      }
    }
  }

  return [...groups.values()].map((group) => {
    const sizes = [...group.sizes.values()].map((size) => ({
      ...size,
      generalStockQuantity: generalStock.get(group.orderId)?.get(normalizedSize(size.size)) ?? 0,
    }));
    const groupWorkOrders = (workOrdersByOrderId.get(group.orderId) ?? [])
      .map((workOrder) => {
        const sizeLines = new Map<string, number>();
        for (const line of workOrder.sizeLines) {
          const size = normalizedSize(line.size || line.buyer_size);
          if (!size) continue;
          sizeLines.set(size, (sizeLines.get(size) ?? 0) + Math.max(line.quantity - line.assigned_quantity, 0));
        }
        return {
          id: workOrder.id,
          workOrderNo: workOrder.work_order_no,
          status: workOrder.status,
          sizeLines: [...sizeLines].map(([size, availableQuantity]) => ({ size, availableQuantity })),
        };
      });
    const fittingWorkOrder = groupWorkOrders.find((workOrder) =>
      sizes.every((size) =>
        size.unassignedQuantity === 0 ||
        (workOrder.sizeLines.find((line) => line.size === normalizedSize(size.size))?.availableQuantity ?? 0) >= size.unassignedQuantity,
      ),
    );

    return {
      orderId: group.orderId,
      orderNo: group.orderNo,
      bookingCount: group.bookingCount,
      totalBooked: group.totalBooked,
      totalUnassigned: group.totalUnassigned,
      totalAllocatableQuantity: sizes.reduce((sum, size) => sum + size.allocatableQuantity, 0),
      totalGeneralStock: sizes.reduce((sum, size) => sum + size.generalStockQuantity, 0),
      sizes,
      workOrders: groupWorkOrders,
      selectedWorkOrderId: fittingWorkOrder?.id ?? groupWorkOrders[0]?.id ?? "",
    };
  });
}

export async function getSalesOrderAllocationData(organizationId: string, salesOrderId: string) {
  if (!organizationId.trim() || !salesOrderId.trim()) {
    throw new Error("A valid organization and Sales Order are required.");
  }
  const { salesOrder, bookings } = await getSalesOrderBookingHeaders(prisma, organizationId, salesOrderId);
  const orderIds = [...new Set(bookings.map((booking) => booking.order_id))];
  const sizeLineIds = bookings.flatMap((booking) => booking.sizeLines.map((line) => line.id));
  const [generalStock, assignmentSummary, rawWorkOrders] = await Promise.all([
    listGeneralFinishedGoodsAvailability(organizationId, orderIds),
    getAdvanceBookingAssignmentSummary(prisma, organizationId, sizeLineIds),
    orderIds.length > 0
      ? prisma.factoryWorkOrder.findMany({
          where: { organization_id: organizationId, order_id: { in: orderIds } },
          select: {
            id: true,
            order_id: true,
            work_order_no: true,
            status: true,
            sizeLines: {
              select: { id: true, size: true, buyer_size: true, quantity: true },
            },
          },
          orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }],
        })
      : Promise.resolve([]),
  ]);
  const workOrderSizeLineIds = rawWorkOrders.flatMap((workOrder) => workOrder.sizeLines.map((line) => line.id));
  const assignedQuantities = workOrderSizeLineIds.length > 0
    ? await prisma.advanceBookingWorkOrderAssignment.groupBy({
        by: ["work_order_size_line_id"],
        where: {
          organization_id: organizationId,
          work_order_id: { in: rawWorkOrders.map((workOrder) => workOrder.id) },
          work_order_size_line_id: { in: workOrderSizeLineIds },
        },
        _sum: { assigned_quantity: true },
      })
    : [];
  const assignedQuantityBySizeLineId = new Map(
    assignedQuantities.map((assignment) => [
      assignment.work_order_size_line_id,
      assignment._sum.assigned_quantity ?? 0,
    ]),
  );
  const workOrders: AllocationWorkOrder[] = rawWorkOrders.map((workOrder) => ({
    ...workOrder,
    sizeLines: workOrder.sizeLines.map((line) => ({
      ...line,
      assigned_quantity: assignedQuantityBySizeLineId.get(line.id) ?? 0,
    })),
  }));
  return {
    salesOrderNo: salesOrder.quotation_no,
    orders: summarizeOrderBookings(
      bookings,
      workOrders,
      generalStock,
      assignmentSummary.assignedBySizeLineId,
      assignmentSummary.fulfilledBySizeLineId,
    ),
  };
}

export async function allocateSalesOrder(
  userId: string,
  publicOrganizationId: string,
  salesOrderId: string,
  mode: AllocationMode,
  workOrderSelections: Array<{ orderId: string; workOrderId: string }> = [],
) {
  if (!publicOrganizationId.trim() || !userId.trim() || !salesOrderId.trim()) {
    throw new Error("A valid organization, actor, and Sales Order are required.");
  }
  if (mode !== "GENERAL" && mode !== "PRODUCTION") {
    throw new Error("Select General Stock or Production allocation.");
  }
  if (!Array.isArray(workOrderSelections) || workOrderSelections.length > 200) {
    throw new Error("Submit valid work-order selections for this Sales Order.");
  }
  const seenOrderIds = new Set<string>();
  for (const selection of workOrderSelections) {
    if (
      !selection.orderId.trim() ||
      !selection.workOrderId.trim() ||
      seenOrderIds.has(selection.orderId)
    ) {
      throw new Error("Each source order needs one valid, unique work-order selection.");
    }
    seenOrderIds.add(selection.orderId);
  }
  if (mode === "GENERAL" && workOrderSelections.length > 0) {
    throw new Error("General Stock allocation does not accept work-order selections.");
  }
  if (mode === "PRODUCTION" && workOrderSelections.length === 0) {
    throw new Error("Select a work order for at least one source order.");
  }
  const membership = await requireOrganizationAccess(
    userId,
    publicOrganizationId,
    mode === "GENERAL" ? ["OWNER", "ADMIN", "INVENTORY"] : ["OWNER", "ADMIN", "MERCHANDISING"],
  );
  const organizationId = membership.organization_id;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const { bookings } = await getSalesOrderBookings(transaction, organizationId, salesOrderId);
        if (bookings.length === 0) throw new Error("No bookings are linked to this Sales Order.");
        const orderIds = [...new Set(bookings.map((booking) => booking.order_id))];

        if (mode === "GENERAL") {
          let allocatedQuantity = 0;
          let allocatedBookings = 0;
          const allocationContext = await loadGeneralStockAllocationContext(
            transaction,
            organizationId,
            bookings.map((booking) => booking.id),
          );
          for (const booking of bookings) {
            if (!allocationContext.bookingById.has(booking.id)) continue;
            const result = await allocateBookingFromGeneralStockInTransaction(
              transaction,
              organizationId,
              userId,
              booking.id,
              [],
              allocationContext,
            );
            const quantity = result.allocatedLines.reduce((sum, line) => sum + line.quantity, 0);
            if (quantity > 0) allocatedBookings += 1;
            allocatedQuantity += quantity;
          }
          return { mode, allocatedBookings, allocatedOrders: orderIds.length, allocatedQuantity };
        }

        const selectionByOrderId = new Map(workOrderSelections.map((selection) => [
          selection.orderId,
          selection.workOrderId,
        ]));
        if ([...selectionByOrderId.keys()].some((orderId) => !orderIds.includes(orderId))) {
          throw new Error("A work-order selection does not belong to this Sales Order.");
        }
        const workOrders = await transaction.factoryWorkOrder.findMany({
          where: { organization_id: organizationId, order_id: { in: orderIds } },
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
        });
        const workOrderById = new Map(workOrders.map((workOrder) => [workOrder.id, workOrder]));
        const bookingsByOrder = new Map<string, typeof bookings>();
        for (const booking of bookings) {
          const orderBookings = bookingsByOrder.get(booking.order_id) ?? [];
          orderBookings.push(booking);
          bookingsByOrder.set(booking.order_id, orderBookings);
        }

        let allocatedQuantity = 0;
        let allocatedBookings = 0;
        for (const [orderId, orderBookings] of bookingsByOrder) {
          const remainingBySize = new Map<string, number>();
          for (const booking of orderBookings) {
            for (const line of booking.sizeLines) {
              const assignedQuantity = line.assignments.reduce(
                (sum, assignment) => sum + assignment.assigned_quantity,
                0,
              );
              const remaining = Math.max(line.booked_quantity - assignedQuantity, 0);
              const size = normalizedSize(line.size);
              if (size && remaining > 0) {
                remainingBySize.set(size, (remainingBySize.get(size) ?? 0) + remaining);
              }
            }
          }
          if (remainingBySize.size === 0) continue;

          const selectedWorkOrderId = selectionByOrderId.get(orderId);
          if (!selectedWorkOrderId) {
            throw new Error(`Select a work order for source order ${orderBookings[0].order.orderNo}.`);
          }
          const workOrder = workOrderById.get(selectedWorkOrderId);
          if (!workOrder || workOrder.order_id !== orderId) {
            throw new Error(`Select a work order linked to source order ${orderBookings[0].order.orderNo}.`);
          }
          const availableBySize = new Map<string, number>();
          for (const line of workOrder.sizeLines) {
            const size = normalizedSize(line.size || line.buyer_size);
            if (!size) continue;
            const assignedQuantity = line.bookingAssignments.reduce(
              (sum, assignment) => sum + assignment.assigned_quantity,
              0,
            );
            availableBySize.set(
              size,
              (availableBySize.get(size) ?? 0) + Math.max(line.quantity - assignedQuantity, 0),
            );
          }
          for (const [size, required] of remainingBySize) {
            const available = availableBySize.get(size) ?? 0;
            if (required > available) {
              throw new Error(
                `Work order ${workOrder.work_order_no} has ${available} ${size} units available, but source order ${orderBookings[0].order.orderNo} needs ${required}. Select another work order.`,
              );
            }
          }

          const assignmentRequests: AdvanceBookingAssignmentRequest[] = [];
          for (const booking of orderBookings) {
            const lines = booking.sizeLines.flatMap((line) => {
              const assignedQuantity = line.assignments.reduce(
                (sum, assignment) => sum + assignment.assigned_quantity,
                0,
              );
              const remaining = Math.max(line.booked_quantity - assignedQuantity, 0);
              return remaining > 0
                ? [{ bookingSizeLineId: line.id, assignedQuantity: remaining }]
                : [];
            });
            if (lines.length === 0) continue;
            assignmentRequests.push({
              bookingId: booking.id,
              input: { workOrderId: workOrder.id, lines },
            });
          }
          if (assignmentRequests.length > 0) {
            await assignBookingsInTransaction(
              transaction,
              organizationId,
              userId,
              assignmentRequests,
            );
            allocatedBookings += assignmentRequests.length;
            allocatedQuantity += assignmentRequests.reduce(
              (sum, request) => sum + request.input.lines.reduce((lineSum, line) => lineSum + line.assignedQuantity, 0),
              0,
            );
          }
        }
        return { mode, allocatedBookings, allocatedOrders: bookingsByOrder.size, allocatedQuantity };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("Booking or inventory balances changed concurrently. Reload and try again.");
}

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
