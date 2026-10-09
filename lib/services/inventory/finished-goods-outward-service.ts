import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

type Database = Prisma.TransactionClient | typeof prisma;
type StockType = "SKU" | "GENERAL" | "ALLOCATED";
type StockSnapshot = {
  stockType: StockType;
  stockBucket: "GENERAL" | "ALLOCATED";
  id: string;
  locationName: string | null;
  skuCode: string | null;
  styleName: string;
  orderNo: string;
  articleNo: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  currentStock: Prisma.Decimal;
};

const outwardBookingVendorSelect = {
  booking_no: true,
  customer: true,
  quotationLines: {
    take: 1,
    select: {
      quotation: {
        select: {
          customer: true,
          vendor: { select: { vendor: true } },
          parentQuotation: {
            select: {
              customer: true,
              vendor: { select: { vendor: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AdvanceBookingSelect;

function vendorNamesForBooking(booking: {
  customer: string | null;
  quotationLines: Array<{
    quotation: {
      customer: string;
      vendor: { vendor: string } | null;
      parentQuotation: { customer: string; vendor: { vendor: string } | null } | null;
    };
  }>;
} | null) {
  const quotation = booking?.quotationLines[0]?.quotation;
  return {
    bookingVendor: booking?.customer ?? null,
    quotationVendor: quotation?.vendor?.vendor ?? quotation?.customer ?? null,
    salesOrderVendor: quotation?.parentQuotation?.vendor?.vendor ?? quotation?.parentQuotation?.customer ?? null,
  };
}

function isStockType(value: string): value is StockType {
  return value === "SKU" || value === "GENERAL" || value === "ALLOCATED";
}

function uniqueIds(ids: string[], label: string) {
  const normalized = ids.map((id) => id.trim());
  if (normalized.length === 0 || normalized.some((id) => !id)) throw new Error(`Select at least one ${label}.`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`A ${label} can only be selected once.`);
  if (normalized.length > 200) throw new Error(`Select no more than 200 ${label}s at a time.`);
  return normalized;
}

function parseQuantity(value: string, allowFraction: boolean) {
  const pattern = allowFraction ? /^\d{1,12}(?:\.\d{1,2})?$/ : /^\d{1,12}$/;
  if (!pattern.test(value.trim())) {
    throw new Error(allowFraction
      ? "Enter a quantity greater than zero with no more than two decimal places."
      : "Enter a whole-number quantity greater than zero for this stock record.");
  }
  const quantity = new Prisma.Decimal(value.trim());
  if (!quantity.gt(0)) throw new Error("Quantity must be greater than zero.");
  return quantity;
}

async function findStock(database: Database, organizationId: string, stockType: StockType, id: string): Promise<StockSnapshot | null> {
  if (stockType === "SKU") {
    const record = await database.finishedGoodsSkuStock.findFirst({
      where: { id, organization_id: organizationId },
      select: {
        id: true, sku_code: true, style_name: true, order_no: true, article_no: true,
        brand: true, size: true, colour: true, current_stock: true,
        location: { select: { location_name: true } },
      },
    });
    return record ? {
      stockType, stockBucket: "GENERAL", id: record.id, locationName: record.location.location_name,
      skuCode: record.sku_code, styleName: record.style_name, orderNo: record.order_no,
      articleNo: record.article_no, brand: record.brand, size: record.size, colour: record.colour,
      currentStock: new Prisma.Decimal(record.current_stock),
    } : null;
  }

  if (stockType === "GENERAL") {
    const record = await database.finishedGoodsGeneralStockReceipt.findFirst({
      where: { id, organization_id: organizationId },
      select: {
        id: true, style_name: true, order_no: true, article_no: true, brand: true, size: true,
        colour: true, current_stock: true, location: { select: { location_name: true } },
      },
    });
    return record ? {
      stockType, stockBucket: "GENERAL", id: record.id, locationName: record.location.location_name,
      skuCode: null, styleName: record.style_name, orderNo: record.order_no,
      articleNo: record.article_no ?? "", brand: record.brand, size: record.size, colour: record.colour,
      currentStock: new Prisma.Decimal(record.current_stock),
    } : null;
  }

  const record = await database.finishedGoodsAllocatedStockReceipt.findFirst({
    where: { id, organization_id: organizationId },
    select: {
      id: true, style_name: true, order_no: true, article_no: true, brand: true, size: true,
      colour: true, current_stock: true, location: { select: { location_name: true } },
    },
  });
  return record ? {
    stockType, stockBucket: "ALLOCATED", id: record.id, locationName: record.location.location_name,
    skuCode: null, styleName: record.style_name, orderNo: record.order_no,
    articleNo: record.article_no ?? "", brand: record.brand, size: record.size, colour: record.colour,
    currentStock: new Prisma.Decimal(record.current_stock),
  } : null;
}

async function refreshRequestStatuses(database: Database, organizationId: string, requestIds: string[]) {
  for (const requestId of [...new Set(requestIds)]) {
    const request = await database.finishedGoodsOutwardRequest.findFirst({
      where: { id: requestId, organization_id: organizationId },
      select: { status: true, lines: { select: { status: true } } },
    });
    if (!request || request.status === "REQUESTED" || request.status === "CANCELLED" || request.lines.length === 0) continue;
    const statuses = request.lines.map((line) => line.status);
    const status = statuses.every((item) => item === "SHIPPED")
      ? "SHIPPED"
      : statuses.every((item) => item === "PACKED" || item === "SHIPPED")
        ? "PACKED"
        : statuses.every((item) => item === "PICKED" || item === "PACKED" || item === "SHIPPED")
          ? "PICKED"
          : "ACCEPTED";
    if (status !== request.status) {
      await database.finishedGoodsOutwardRequest.updateMany({
        where: { id: requestId, organization_id: organizationId, status: request.status },
        data: { status },
      });
    }
  }
}

type OutwardRequestInput = {
  organizationId: string;
  actorId: string;
  actorName: string;
  lines: Array<{ stockType: StockType; stockId: string; quantity: string; sourceBookingId?: string }>;
};

async function createOutwardRequestInTransaction(
  transaction: Prisma.TransactionClient,
  input: OutwardRequestInput,
) {
  if (input.lines.length === 0 || input.lines.length > 200) throw new Error("Select between 1 and 200 finished-goods stock records.");
  const selectedIds = input.lines.map(({ stockType, stockId }) => {
    if (!["SKU", "GENERAL", "ALLOCATED"].includes(stockType)) throw new Error("Select a valid finished-goods stock type.");
    return `${stockType}:${stockId.trim()}`;
  });
  if (selectedIds.some((id) => id.endsWith(":")) || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error("Each finished-goods stock record can only be selected once.");
  }

  const selected = await Promise.all(input.lines.map(async (line) => {
    const stock = await findStock(transaction, input.organizationId, line.stockType, line.stockId.trim());
    if (!stock) throw new Error("A selected finished-goods stock record was not found in this organization.");
    const quantity = parseQuantity(line.quantity, stock.stockType === "SKU");
    if (quantity.gt(stock.currentStock)) {
      throw new Error(`${stock.styleName} has only ${stock.currentStock.toString()} available in this stock record.`);
    }
    return { stock, quantity, sourceBookingId: line.sourceBookingId };
  }));

  const existingLines = await transaction.finishedGoodsOutwardRequestLine.findMany({
    where: {
      organization_id: input.organizationId,
      OR: selected.map(({ stock }) => ({ source_stock_type: stock.stockType, source_stock_id: stock.id })),
      request: { organization_id: input.organizationId, status: { not: "CANCELLED" } },
    },
    select: {
      source_stock_type: true, source_stock_id: true,
      requested_quantity: true, shipped_quantity: true,
    },
  });
  const reserved = new Map<string, Prisma.Decimal>();
  for (const line of existingLines) {
    const key = `${line.source_stock_type}:${line.source_stock_id}`;
    reserved.set(key, (reserved.get(key) ?? new Prisma.Decimal(0))
      .plus(Prisma.Decimal.max(line.requested_quantity.minus(line.shipped_quantity), 0)));
  }
  for (const { stock, quantity } of selected) {
    const available = Prisma.Decimal.max(stock.currentStock.minus(reserved.get(`${stock.stockType}:${stock.id}`) ?? 0), 0);
    if (quantity.gt(available)) {
      throw new Error(`${stock.styleName} has only ${available.toString()} available to request after other open requests.`);
    }
  }

  const requestNo = await reserveProcurementDocumentNumber(input.organizationId, "FG_OUTWARD_REQUEST", transaction);
  const requestData = {
    organization_id: input.organizationId,
    request_no: requestNo,
    requested_by: input.actorName,
    lines: {
      create: selected.map(({ stock, quantity, sourceBookingId }) => ({
        source_booking_id: sourceBookingId ?? null,
        source_stock_type: stock.stockType,
        source_stock_id: stock.id,
        stock_bucket: stock.stockBucket,
        location_name: stock.locationName,
        sku_code: stock.skuCode,
        style_name: stock.styleName,
        order_no: stock.orderNo,
        article_no: stock.articleNo,
        brand: stock.brand,
        size: stock.size,
        colour: stock.colour,
        requested_quantity: quantity,
      })),
    },
  } satisfies Prisma.FinishedGoodsOutwardRequestUncheckedCreateInput;
  const request = await transaction.finishedGoodsOutwardRequest.create({
    data: requestData,
    select: { id: true, request_no: true, status: true },
  });
  await createAuditEvent({
    organizationId: input.organizationId,
    userId: input.actorId,
    module: "Inventory Management",
    action: "FG_STOCK_OUTWARD_REQUESTED",
    entityType: "FinishedGoodsOutwardRequest",
    entityId: request.id,
    details: { requestNo, lineCount: selected.length },
  }, transaction);
  return request;
}

export async function createFinishedGoodsOutwardRequest(input: OutwardRequestInput) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(
    (transaction) => createOutwardRequestInTransaction(transaction, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createFinishedGoodsOutwardRequestFromBookings(input: {
  organizationId: string;
  actorId: string;
  actorName: string;
  bookingRequests: Array<{
    bookingId: string;
    sizeRequests: Array<{ sizeLineId: string; quantity: string }>;
  }>;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
  const bookingIds = uniqueIds(input.bookingRequests.map(({ bookingId }) => bookingId), "shipment tracking record");
  if (bookingIds.length > 200) throw new Error("Select no more than 200 shipment tracking records.");
  const requestedQuantities = new Map<string, Map<string, Prisma.Decimal>>();
  for (const request of input.bookingRequests) {
    if (!Array.isArray(request.sizeRequests) || request.sizeRequests.length === 0) {
      throw new Error("Enter a finished-goods quantity for every booking size.");
    }
    const quantitiesBySize = new Map<string, Prisma.Decimal>();
    for (const sizeRequest of request.sizeRequests) {
      const sizeLineId = sizeRequest.sizeLineId.trim();
      if (!sizeLineId || quantitiesBySize.has(sizeLineId)) {
        throw new Error("Each booking size can only be requested once.");
      }
      if (!/^\d{1,12}$/.test(sizeRequest.quantity.trim())) {
        throw new Error("Enter a whole-number finished-goods request quantity for every size.");
      }
      quantitiesBySize.set(sizeLineId, new Prisma.Decimal(sizeRequest.quantity.trim()));
    }
    requestedQuantities.set(request.bookingId.trim(), quantitiesBySize);
  }

  return prisma.$transaction(async (transaction) => {
    const bookings = await transaction.advanceBooking.findMany({
      where: { organization_id: input.organizationId, id: { in: bookingIds } },
      select: {
        id: true,
        booking_no: true,
        quotationLines: {
          take: 1,
          select: {
            quotation: {
              select: {
                vendor_id: true,
                customer: true,
                vendor: { select: { vendor: true } },
                parentQuotation: {
                  select: {
                    vendor_id: true,
                    customer: true,
                    vendor: { select: { vendor: true } },
                  },
                },
              },
            },
          },
        },
        sizeLines: {
          select: {
            id: true,
            size: true,
            booked_quantity: true,
            assignments: {
              select: {
                assigned_quantity: true,
                grnAllocations: { select: { allocated_quantity: true } },
              },
            },
          },
        },
      },
    });
    if (bookings.length !== bookingIds.length) throw new Error("One or more selected bookings were not found in this organization.");
    const notAssigned = bookings.filter((booking) =>
      booking.sizeLines.some((line) =>
        line.assignments.reduce((total, assignment) => total + assignment.assigned_quantity, 0) < line.booked_quantity,
      ),
    );
    if (notAssigned.length > 0) {
      throw new Error(`Assign every booked size to a work order before requesting finished goods: ${notAssigned.map((booking) => booking.booking_no).join(", ")}.`);
    }
    for (const booking of bookings) {
      const quantitiesBySize = requestedQuantities.get(booking.id)!;
      if (quantitiesBySize.size !== booking.sizeLines.length ||
        booking.sizeLines.some((line) => !quantitiesBySize.has(line.id))) {
        throw new Error(`Enter a request quantity for every size of ${booking.booking_no}.`);
      }
      for (const sizeLine of booking.sizeLines) {
        const fulfilledQuantity = sizeLine.assignments.reduce(
          (lineTotal, assignment) => lineTotal + assignment.grnAllocations.reduce(
            (assignmentTotal, allocation) => assignmentTotal + allocation.allocated_quantity,
            0,
          ),
          0,
        );
        const requestedQuantity = quantitiesBySize.get(sizeLine.id)!;
        if (requestedQuantity.gt(fulfilledQuantity)) {
          throw new Error(`The requested quantity for size ${sizeLine.size} of ${booking.booking_no} exceeds its fulfilled quantity of ${fulfilledQuantity}.`);
        }
      }
    }
    for (const booking of bookings) {
      const quotation = booking.quotationLines[0]?.quotation;
      if (!quotation?.vendor_id || !quotation.vendor?.vendor.trim() ||
          !quotation.parentQuotation?.vendor_id || !quotation.parentQuotation.vendor?.vendor.trim()) {
        throw new Error(`A quotation vendor and Sales Order vendor are required before requesting finished goods for ${booking.booking_no}.`);
      }
    }

    const stockRecords = await transaction.finishedGoodsAllocatedStockReceipt.findMany({
      where: {
        organization_id: input.organizationId,
        booking_id: { in: bookingIds },
        current_stock: { gt: 0 },
      },
      select: { id: true, booking_id: true, booking_size_line_id: true, size: true, current_stock: true },
      orderBy: [{ posted_at: "asc" }, { id: "asc" }],
    });
    const stockIds = stockRecords.map((stock) => stock.id);
    const existingLines = stockIds.length === 0 ? [] : await transaction.finishedGoodsOutwardRequestLine.findMany({
      where: {
        organization_id: input.organizationId,
        source_stock_type: "ALLOCATED",
        source_stock_id: { in: stockIds },
        request: { organization_id: input.organizationId, status: { not: "CANCELLED" } },
      },
      select: { source_stock_id: true, requested_quantity: true, shipped_quantity: true },
    });
    const reservedByStock = new Map<string, Prisma.Decimal>();
    for (const line of existingLines) {
      reservedByStock.set(
        line.source_stock_id,
        (reservedByStock.get(line.source_stock_id) ?? new Prisma.Decimal(0))
          .plus(Prisma.Decimal.max(line.requested_quantity.minus(line.shipped_quantity), 0)),
      );
    }
    const lines: OutwardRequestInput["lines"] = [];
    for (const booking of bookings) {
      const quantitiesBySize = requestedQuantities.get(booking.id)!;
      for (const sizeLine of booking.sizeLines) {
        let remaining = quantitiesBySize.get(sizeLine.id)!;
        if (remaining.isZero()) continue;
        for (const stock of stockRecords.filter((record) =>
          record.booking_id === booking.id && record.booking_size_line_id === sizeLine.id,
        )) {
          const available = Prisma.Decimal.max(
            new Prisma.Decimal(stock.current_stock).minus(reservedByStock.get(stock.id) ?? 0),
            0,
          );
          const quantity = Prisma.Decimal.min(available, remaining);
          if (quantity.gt(0)) {
            lines.push({
              stockType: "ALLOCATED",
              stockId: stock.id,
              quantity: quantity.toString(),
              sourceBookingId: booking.id,
            });
            remaining = remaining.minus(quantity);
          }
          if (remaining.isZero()) break;
        }
        if (remaining.gt(0)) {
          throw new Error(`The requested quantity for size ${sizeLine.size} of ${booking.booking_no} exceeds its available Allocated inventory.`);
        }
      }
    }
    if (lines.length === 0) throw new Error("Enter a finished-goods request quantity greater than zero for at least one size.");
    const request = await createOutwardRequestInTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorName: input.actorName,
      lines,
    });
    return { ...request, bookingCount: bookings.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function acceptFinishedGoodsOutwardRequest(input: {
  organizationId: string; requestId: string; actorId: string; actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const request = await transaction.finishedGoodsOutwardRequest.findFirst({
      where: { id: input.requestId, organization_id: input.organizationId, status: "REQUESTED" },
      select: { id: true, request_no: true, lines: { select: { id: true } } },
    });
    if (!request || request.lines.length === 0) throw new Error("This FG stock request is no longer waiting for acceptance.");
    const updated = await transaction.finishedGoodsOutwardRequest.updateMany({
      where: { id: request.id, organization_id: input.organizationId, status: "REQUESTED" },
      data: { status: "ACCEPTED", accepted_by: input.actorName, accepted_at: new Date() },
    });
    const lines = await transaction.finishedGoodsOutwardRequestLine.updateMany({
      where: { request_id: request.id, organization_id: input.organizationId, status: "REQUESTED" },
      data: { status: "ACCEPTED" },
    });
    if (updated.count !== 1 || lines.count !== request.lines.length) throw new Error("This FG stock request changed before acceptance. Reload and try again.");
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_ACCEPTED", entityType: "FinishedGoodsOutwardRequest",
      entityId: request.id, details: { requestNo: request.request_no },
    }, transaction);
    return { id: request.id, status: "ACCEPTED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelFinishedGoodsOutwardRequest(input: {
  organizationId: string; requestId: string; actorId: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const request = await transaction.finishedGoodsOutwardRequest.findFirst({
      where: { id: input.requestId, organization_id: input.organizationId, status: { in: ["REQUESTED", "ACCEPTED"] } },
      select: {
        id: true,
        request_no: true,
        status: true,
        lines: {
          select: {
            id: true,
            status: true,
            picked_quantity: true,
            shipped_quantity: true,
            boxLines: { select: { id: true } },
          },
        },
      },
    });
    if (!request) throw new Error("Only a request awaiting approval or pick can be cancelled.");
    if (request.lines.some((line) =>
      line.status !== request.status || line.picked_quantity.gt(0) || line.shipped_quantity.gt(0) || line.boxLines.length > 0,
    )) {
      throw new Error("Undo picking and remove boxes before cancelling this FG request.");
    }
    const updated = await transaction.finishedGoodsOutwardRequest.updateMany({
      where: { id: request.id, organization_id: input.organizationId, status: request.status },
      data: { status: "CANCELLED" },
    });
    const lines = await transaction.finishedGoodsOutwardRequestLine.updateMany({
      where: { request_id: request.id, organization_id: input.organizationId, status: request.status },
      data: { status: "CANCELLED" },
    });
    if (updated.count !== 1 || lines.count !== request.lines.length) throw new Error("This FG stock request changed before cancellation. Reload and try again.");
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_CANCELLED", entityType: "FinishedGoodsOutwardRequest",
      entityId: request.id, details: { requestNo: request.request_no },
    }, transaction);
    return { id: request.id, status: "CANCELLED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function unpickFinishedGoodsOutwardLine(input: {
  organizationId: string; requestLineId: string; actorId: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const line = await transaction.finishedGoodsOutwardRequestLine.findFirst({
      where: {
        id: input.requestLineId,
        organization_id: input.organizationId,
        status: "PICKED",
        shipped_quantity: 0,
        request: { organization_id: input.organizationId, status: { in: ["ACCEPTED", "PICKED"] } },
      },
      select: {
        id: true,
        request_id: true,
        style_name: true,
        picked_quantity: true,
        boxLines: { select: { id: true } },
      },
    });
    if (!line) throw new Error("Only an unboxed picked FG item can be returned to Pick.");
    if (line.boxLines.length > 0) throw new Error("Remove the item's box before undoing its pick.");
    const updated = await transaction.finishedGoodsOutwardRequestLine.updateMany({
      where: {
        id: line.id,
        organization_id: input.organizationId,
        status: "PICKED",
        shipped_quantity: 0,
        picked_quantity: line.picked_quantity,
      },
      data: { status: "ACCEPTED", picked_quantity: 0, picked_by: null, picked_at: null },
    });
    if (updated.count !== 1) throw new Error("This FG item changed before its pick could be undone. Reload and try again.");
    await refreshRequestStatuses(transaction, input.organizationId, [line.request_id]);
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_PICK_REVERSED", entityType: "FinishedGoodsOutwardRequestLine",
      entityId: line.id, details: { styleName: line.style_name, quantity: line.picked_quantity.toString() },
    }, transaction);
    return { id: line.id, status: "ACCEPTED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function pickFinishedGoodsOutwardLine(input: {
  organizationId: string; requestLineId: string; actorId: string; actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const line = await transaction.finishedGoodsOutwardRequestLine.findFirst({
      where: {
        id: input.requestLineId, organization_id: input.organizationId, status: "ACCEPTED",
        request: { organization_id: input.organizationId, status: { not: "CANCELLED" } },
      },
      select: { id: true, request_id: true, style_name: true, requested_quantity: true },
    });
    if (!line) throw new Error("This FG item is no longer waiting to be picked.");
    const updated = await transaction.finishedGoodsOutwardRequestLine.updateMany({
      where: { id: line.id, organization_id: input.organizationId, status: "ACCEPTED" },
      data: { status: "PICKED", picked_quantity: line.requested_quantity, picked_by: input.actorName, picked_at: new Date() },
    });
    if (updated.count !== 1) throw new Error("This FG item changed before it could be picked. Reload and try again.");
    await refreshRequestStatuses(transaction, input.organizationId, [line.request_id]);
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_PICKED", entityType: "FinishedGoodsOutwardRequestLine",
      entityId: line.id, details: { styleName: line.style_name, quantity: line.requested_quantity.toString() },
    }, transaction);
    return { id: line.id, status: "PICKED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createFinishedGoodsOutwardBox(input: {
  organizationId: string; requestLineIds: string[]; boxNo: string; actorId: string; actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  const requestLineIds = uniqueIds(input.requestLineIds, "picked item");
  const boxNo = input.boxNo.trim();
  if (!boxNo || boxNo.length > 100) throw new Error("Enter a box number of 1 to 100 characters.");
  return prisma.$transaction(async (transaction) => {
    const lines = await transaction.finishedGoodsOutwardRequestLine.findMany({
      where: {
        id: { in: requestLineIds }, organization_id: input.organizationId, status: { in: ["PICKED", "PACKED"] },
        request: { organization_id: input.organizationId, status: { notIn: ["REQUESTED", "CANCELLED"] } },
      },
      select: { id: true, request_id: true, picked_quantity: true },
    });
    if (lines.length !== requestLineIds.length) throw new Error("One or more selected FG items are unavailable to pack.");
    const packedLines = await transaction.finishedGoodsOutwardBoxLine.findMany({
      where: { organization_id: input.organizationId, request_line_id: { in: requestLineIds } },
      select: { request_line_id: true, quantity: true },
    });
    const packedByLine = new Map<string, Prisma.Decimal>();
    for (const packedLine of packedLines) {
      packedByLine.set(packedLine.request_line_id, (packedByLine.get(packedLine.request_line_id) ?? new Prisma.Decimal(0)).plus(packedLine.quantity));
    }
    const toPack = lines.map((line) => ({
      line,
      quantity: Prisma.Decimal.max(line.picked_quantity.minus(packedByLine.get(line.id) ?? 0), 0),
    })).filter(({ quantity }) => quantity.gt(0));
    if (toPack.length === 0) throw new Error("The selected FG items have no picked quantity remaining to box.");

    const box = await transaction.finishedGoodsOutwardBox.create({
      data: { organization_id: input.organizationId, box_no: boxNo, packed_by: input.actorName },
      select: { id: true, box_no: true, packed_at: true },
    });
    await transaction.finishedGoodsOutwardBoxLine.createMany({
      data: toPack.map(({ line, quantity }) => ({
        organization_id: input.organizationId, box_id: box.id, request_line_id: line.id, quantity,
      })),
    });
    for (const { line } of toPack) {
      const packed = (packedByLine.get(line.id) ?? new Prisma.Decimal(0))
        .plus(Prisma.Decimal.max(line.picked_quantity.minus(packedByLine.get(line.id) ?? 0), 0));
      if (packed.greaterThanOrEqualTo(line.picked_quantity)) {
        await transaction.finishedGoodsOutwardRequestLine.updateMany({
          where: { id: line.id, organization_id: input.organizationId, status: { in: ["PICKED", "PACKED"] } },
          data: { status: "PACKED" },
        });
      }
    }
    await refreshRequestStatuses(transaction, input.organizationId, toPack.map(({ line }) => line.request_id));
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_BOX_CREATED", entityType: "FinishedGoodsOutwardBox",
      entityId: box.id, details: { boxNo, lineCount: toPack.length },
    }, transaction);
    return box;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteFinishedGoodsOutwardBox(input: {
  organizationId: string; boxId: string; actorId: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const box = await transaction.finishedGoodsOutwardBox.findFirst({
      where: { id: input.boxId, organization_id: input.organizationId, shipment: { is: null } },
      select: { id: true, box_no: true, lines: { select: { request_line_id: true } } },
    });
    if (!box) throw new Error("Only an unshipped FG box in this organization can be removed.");
    const requestLineIds = [...new Set(box.lines.map((line) => line.request_line_id))];
    const deletedLines = await transaction.finishedGoodsOutwardBoxLine.deleteMany({
      where: { organization_id: input.organizationId, box_id: box.id },
    });
    if (deletedLines.count !== box.lines.length) throw new Error("This box changed before it could be removed. Reload and try again.");
    const deletedBox = await transaction.finishedGoodsOutwardBox.deleteMany({
      where: { id: box.id, organization_id: input.organizationId },
    });
    if (deletedBox.count !== 1) throw new Error("This box changed before it could be removed. Reload and try again.");

    const [requestLines, remainingBoxLines] = await Promise.all([
      requestLineIds.length === 0 ? Promise.resolve([]) : transaction.finishedGoodsOutwardRequestLine.findMany({
        where: { id: { in: requestLineIds }, organization_id: input.organizationId },
        select: { id: true, request_id: true, picked_quantity: true, shipped_quantity: true, status: true },
      }),
      requestLineIds.length === 0 ? Promise.resolve([]) : transaction.finishedGoodsOutwardBoxLine.findMany({
        where: { organization_id: input.organizationId, request_line_id: { in: requestLineIds } },
        select: { request_line_id: true, quantity: true },
      }),
    ]);
    const packedByLine = new Map<string, Prisma.Decimal>();
    for (const line of remainingBoxLines) {
      packedByLine.set(line.request_line_id, (packedByLine.get(line.request_line_id) ?? new Prisma.Decimal(0)).plus(line.quantity));
    }
    for (const line of requestLines) {
      const nextStatus = line.shipped_quantity.greaterThanOrEqualTo(line.picked_quantity)
        ? "SHIPPED"
        : (packedByLine.get(line.id) ?? new Prisma.Decimal(0)).greaterThanOrEqualTo(line.picked_quantity)
          ? "PACKED" : "PICKED";
      if (nextStatus !== line.status) {
        await transaction.finishedGoodsOutwardRequestLine.updateMany({
          where: { id: line.id, organization_id: input.organizationId, status: line.status },
          data: { status: nextStatus },
        });
      }
    }
    await refreshRequestStatuses(transaction, input.organizationId, requestLines.map((line) => line.request_id));
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_BOX_REMOVED", entityType: "FinishedGoodsOutwardBox",
      entityId: box.id, details: { boxNo: box.box_no, lineCount: box.lines.length },
    }, transaction);
    return { id: box.id, box_no: box.box_no };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function decrementStock(database: Database, organizationId: string, stockType: StockType, stockId: string, quantity: Prisma.Decimal) {
  if (stockType === "SKU") {
    const updated = await database.finishedGoodsSkuStock.updateMany({
      where: { id: stockId, organization_id: organizationId, current_stock: { gte: quantity } },
      data: { qty_out: { increment: quantity }, current_stock: { decrement: quantity } },
    });
    if (updated.count !== 1) throw new Error("FG stock changed or is insufficient for this shipment. Reload and try again.");
    return;
  }
  if (!quantity.isInteger()) throw new Error("Finished-goods GRN stock can only be shipped in whole units.");
  const amount = quantity.toNumber();
  const where = { id: stockId, organization_id: organizationId, current_stock: { gte: amount } };
  const data = { quantity_out: { increment: amount }, current_stock: { decrement: amount } };
  const updated = stockType === "GENERAL"
    ? await database.finishedGoodsGeneralStockReceipt.updateMany({ where, data })
    : await database.finishedGoodsAllocatedStockReceipt.updateMany({ where, data });
  if (updated.count !== 1) throw new Error("FG stock changed or is insufficient for this shipment. Reload and try again.");
}

async function restoreStock(database: Database, organizationId: string, stockType: StockType, stockId: string, quantity: Prisma.Decimal) {
  if (stockType === "SKU") {
    const updated = await database.finishedGoodsSkuStock.updateMany({
      where: { id: stockId, organization_id: organizationId, qty_out: { gte: quantity } },
      data: { qty_out: { decrement: quantity }, current_stock: { increment: quantity } },
    });
    if (updated.count !== 1) throw new Error("The shipped FG stock balance changed; this shipment cannot be reversed safely.");
    return;
  }
  if (!quantity.isInteger()) throw new Error("Finished-goods GRN stock can only be restored in whole units.");
  const amount = quantity.toNumber();
  const where = { id: stockId, organization_id: organizationId, quantity_out: { gte: amount } };
  const data = { quantity_out: { decrement: amount }, current_stock: { increment: amount } };
  const updated = stockType === "GENERAL"
    ? await database.finishedGoodsGeneralStockReceipt.updateMany({ where, data })
    : await database.finishedGoodsAllocatedStockReceipt.updateMany({ where, data });
  if (updated.count !== 1) throw new Error("The shipped FG stock balance changed; this shipment cannot be reversed safely.");
}

export async function createFinishedGoodsOutwardPackingList(input: {
  organizationId: string; boxIds: string[]; actorId: string; actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  const boxIds = uniqueIds(input.boxIds, "box");
  return prisma.$transaction(async (transaction) => {
    const boxes = await transaction.finishedGoodsOutwardBox.findMany({
      where: { id: { in: boxIds }, organization_id: input.organizationId, shipment: { is: null } },
      select: { id: true, box_no: true, lines: { select: { id: true } } },
    });
    if (boxes.length !== boxIds.length) throw new Error("One or more selected boxes are already on a packing list or unavailable.");
    if (boxes.some((box) => box.lines.length === 0)) throw new Error("A shipment cannot include an empty box.");

    const packingListNo = await reserveProcurementDocumentNumber(
      input.organizationId, "FG_OUTWARD_PACKING_LIST", transaction,
    );
    const shipment = await transaction.finishedGoodsOutwardShipment.create({
      data: { organization_id: input.organizationId, packing_list_no: packingListNo, shipped_by: input.actorName },
      select: { id: true, packing_list_no: true, created_at: true },
    });
    await transaction.finishedGoodsOutwardShipmentBox.createMany({
      data: boxes.map((box) => ({ organization_id: input.organizationId, shipment_id: shipment.id, box_id: box.id })),
    });
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_PACKING_LIST_CREATED", entityType: "FinishedGoodsOutwardShipment",
      entityId: shipment.id,
      details: { packingListNo, boxNos: boxes.map((box) => box.box_no) },
    }, transaction);
    return { ...shipment, boxCount: boxes.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function markFinishedGoodsOutwardShipmentShipped(input: {
  organizationId: string; shipmentId: string; actorId: string; actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const shipment = await transaction.finishedGoodsOutwardShipment.findFirst({
      where: { id: input.shipmentId, organization_id: input.organizationId },
      select: {
        id: true,
        packing_list_no: true,
        boxes: {
          select: {
            box_id: true,
            box: {
              select: {
                box_no: true,
                lines: {
                  select: {
                    quantity: true,
                    requestLine: {
                      select: {
                        id: true,
                        request_id: true,
                        source_stock_type: true,
                        source_stock_id: true,
                        requested_quantity: true,
                        shipped_quantity: true,
                        picked_quantity: true,
                        style_name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!shipment) throw new Error("The FG packing list was not found in this organization.");
    const [createdEvent, shippedEvent, reversedEvent] = await Promise.all([
      transaction.auditEvent.findFirst({
        where: {
          organization_id: input.organizationId, action: "FG_STOCK_OUTWARD_PACKING_LIST_CREATED",
          entity_type: "FinishedGoodsOutwardShipment", entity_id: shipment.id,
        },
        select: { id: true },
      }),
      transaction.auditEvent.findFirst({
        where: {
          organization_id: input.organizationId, action: "FG_STOCK_OUTWARD_SHIPPED",
          entity_type: "FinishedGoodsOutwardShipment", entity_id: shipment.id,
        },
        select: { id: true },
      }),
      transaction.auditEvent.findFirst({
        where: {
          organization_id: input.organizationId, action: "FG_STOCK_OUTWARD_SHIPMENT_REVERSED",
          entity_type: "FinishedGoodsOutwardShipment", entity_id: shipment.id,
        },
        select: { id: true },
      }),
    ]);
    if (!createdEvent) throw new Error("The FG packing list has no creation audit record and cannot be shipped safely.");
    if (shippedEvent) throw new Error("This FG packing list has already been marked as shipped.");
    if (reversedEvent) throw new Error("A reversed packing list cannot be shipped again; create a new packing list.");
    if (shipment.boxes.length === 0) throw new Error("A packing list must contain at least one box before it can be shipped.");
    if (shipment.boxes.some(({ box }) => box.lines.length === 0)) throw new Error("A packing list cannot contain an empty box.");

    const stockQuantities = new Map<string, { stockType: StockType; stockId: string; quantity: Prisma.Decimal }>();
    const lineQuantities = new Map<string, {
      line: (typeof shipment.boxes)[number]["box"]["lines"][number]["requestLine"];
      quantity: Prisma.Decimal;
    }>();
    for (const shipmentBox of shipment.boxes) {
      for (const boxLine of shipmentBox.box.lines) {
        const line = boxLine.requestLine;
        if (!isStockType(line.source_stock_type)) throw new Error("An FG packing list contains an invalid stock source.");
        const stockKey = `${line.source_stock_type}:${line.source_stock_id}`;
        const stockTotal = stockQuantities.get(stockKey);
        stockQuantities.set(stockKey, {
          stockType: line.source_stock_type,
          stockId: line.source_stock_id,
          quantity: (stockTotal?.quantity ?? new Prisma.Decimal(0)).plus(boxLine.quantity),
        });
        const lineTotal = lineQuantities.get(line.id);
        lineQuantities.set(line.id, {
          line,
          quantity: (lineTotal?.quantity ?? new Prisma.Decimal(0)).plus(boxLine.quantity),
        });
      }
    }

    const stockAdjustments: Array<{
      stockType: StockType;
      stockId: string;
      quantity: string;
      stockBefore: string;
      stockAfter: string;
    }> = [];
    for (const stock of stockQuantities.values()) {
      const current = await findStock(transaction, input.organizationId, stock.stockType, stock.stockId);
      if (!current || current.currentStock.lt(stock.quantity)) {
        throw new Error("FG stock changed or is insufficient for this shipment. Reload and try again.");
      }
      await decrementStock(transaction, input.organizationId, stock.stockType, stock.stockId, stock.quantity);
      stockAdjustments.push({
        stockType: stock.stockType,
        stockId: stock.stockId,
        quantity: stock.quantity.toString(),
        stockBefore: current.currentStock.toString(),
        stockAfter: current.currentStock.minus(stock.quantity).toString(),
      });
    }
    for (const { line, quantity } of lineQuantities.values()) {
      const shippedQuantity = line.shipped_quantity.plus(quantity);
      if (shippedQuantity.gt(line.requested_quantity)) throw new Error("Shipment quantity exceeds the FG request quantity.");
      const status = shippedQuantity.greaterThanOrEqualTo(line.requested_quantity) ? "SHIPPED" : "PACKED";
      const updated = await transaction.finishedGoodsOutwardRequestLine.updateMany({
        where: {
          id: line.id, organization_id: input.organizationId, shipped_quantity: line.shipped_quantity,
          status: { in: ["PICKED", "PACKED", "SHIPPED"] },
        },
        data: { shipped_quantity: { increment: quantity }, status },
      });
      if (updated.count !== 1) throw new Error("An FG request line changed before shipment. Reload and try again.");
    }
    await transaction.finishedGoodsOutwardShipment.updateMany({
      where: { id: shipment.id, organization_id: input.organizationId },
      data: { shipped_at: new Date(), shipped_by: input.actorName },
    });
    await refreshRequestStatuses(transaction, input.organizationId, [...new Set(
      [...lineQuantities.values()].map(({ line }) => line.request_id),
    )]);
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_SHIPPED", entityType: "FinishedGoodsOutwardShipment",
      entityId: shipment.id,
      details: { packingListNo: shipment.packing_list_no, boxNos: shipment.boxes.map(({ box }) => box.box_no), stockAdjustments },
    }, transaction);
    return { id: shipment.id, packing_list_no: shipment.packing_list_no, status: "SHIPPED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteFinishedGoodsOutwardPackingList(input: {
  organizationId: string; shipmentId: string; actorId: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const shipment = await transaction.finishedGoodsOutwardShipment.findFirst({
      where: { id: input.shipmentId, organization_id: input.organizationId },
      select: { id: true, packing_list_no: true, boxes: { select: { box_id: true } } },
    });
    if (!shipment) throw new Error("The FG packing list was not found in this organization.");
    const [createdEvent, shippedEvent] = await Promise.all([
      transaction.auditEvent.findFirst({
        where: {
          organization_id: input.organizationId, action: "FG_STOCK_OUTWARD_PACKING_LIST_CREATED",
          entity_type: "FinishedGoodsOutwardShipment", entity_id: shipment.id,
        },
        select: { id: true },
      }),
      transaction.auditEvent.findFirst({
        where: {
          organization_id: input.organizationId, action: "FG_STOCK_OUTWARD_SHIPPED",
          entity_type: "FinishedGoodsOutwardShipment", entity_id: shipment.id,
        },
        select: { id: true },
      }),
    ]);
    if (!createdEvent) throw new Error("The packing list has no creation audit record and cannot be deleted safely.");
    if (shippedEvent) throw new Error("A shipped packing list must be reversed, not deleted.");
    const deletedLinks = await transaction.finishedGoodsOutwardShipmentBox.deleteMany({
      where: { organization_id: input.organizationId, shipment_id: shipment.id },
    });
    if (deletedLinks.count !== shipment.boxes.length) throw new Error("The packing list changed before it could be deleted. Reload and try again.");
    const deletedShipment = await transaction.finishedGoodsOutwardShipment.deleteMany({
      where: { id: shipment.id, organization_id: input.organizationId },
    });
    if (deletedShipment.count !== 1) throw new Error("The packing list changed before it could be deleted. Reload and try again.");
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_PACKING_LIST_DELETED", entityType: "FinishedGoodsOutwardShipment",
      entityId: shipment.id, details: { packingListNo: shipment.packing_list_no, boxCount: shipment.boxes.length },
    }, transaction);
    return { id: shipment.id, packing_list_no: shipment.packing_list_no, status: "DELETED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reverseFinishedGoodsOutwardShipment(input: {
  organizationId: string; shipmentId: string; actorId: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const shipment = await transaction.finishedGoodsOutwardShipment.findFirst({
      where: { id: input.shipmentId, organization_id: input.organizationId },
      select: {
        id: true,
        packing_list_no: true,
        boxes: {
          select: {
            box_id: true,
            box: {
              select: {
                box_no: true,
                lines: {
                  select: {
                    request_line_id: true,
                    quantity: true,
                    requestLine: {
                      select: {
                        id: true,
                        request_id: true,
                        source_stock_type: true,
                        source_stock_id: true,
                        requested_quantity: true,
                        shipped_quantity: true,
                        picked_quantity: true,
                        style_name: true,
                        article_no: true,
                        order_no: true,
                        brand: true,
                        size: true,
                        colour: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!shipment) throw new Error("The FG shipment was not found in this organization.");
    const [originalShipmentEvent, previousReversal] = await Promise.all([
      transaction.auditEvent.findFirst({
        where: {
          organization_id: input.organizationId,
          action: "FG_STOCK_OUTWARD_SHIPPED",
          entity_type: "FinishedGoodsOutwardShipment",
          entity_id: shipment.id,
        },
        select: { id: true },
      }),
      transaction.auditEvent.findFirst({
        where: {
          organization_id: input.organizationId,
          action: "FG_STOCK_OUTWARD_SHIPMENT_REVERSED",
          entity_type: "FinishedGoodsOutwardShipment",
          entity_id: shipment.id,
        },
        select: { id: true },
      }),
    ]);
    if (!originalShipmentEvent) throw new Error("The FG shipment has no posted audit record and cannot be reversed safely.");
    if (previousReversal) throw new Error("This FG shipment has already been reversed.");
    if (shipment.boxes.length === 0) throw new Error("This FG shipment has no linked boxes to reverse.");

    const stockQuantities = new Map<string, { stockType: StockType; stockId: string; quantity: Prisma.Decimal }>();
    const lineQuantities = new Map<string, {
      line: (typeof shipment.boxes)[number]["box"]["lines"][number]["requestLine"];
      quantity: Prisma.Decimal;
    }>();
    for (const shipmentBox of shipment.boxes) {
      for (const boxLine of shipmentBox.box.lines) {
        const line = boxLine.requestLine;
        if (!isStockType(line.source_stock_type)) throw new Error("An FG shipment contains an invalid stock source.");
        const stockKey = `${line.source_stock_type}:${line.source_stock_id}`;
        const stockTotal = stockQuantities.get(stockKey);
        stockQuantities.set(stockKey, {
          stockType: line.source_stock_type,
          stockId: line.source_stock_id,
          quantity: (stockTotal?.quantity ?? new Prisma.Decimal(0)).plus(boxLine.quantity),
        });
        const lineTotal = lineQuantities.get(line.id);
        lineQuantities.set(line.id, {
          line,
          quantity: (lineTotal?.quantity ?? new Prisma.Decimal(0)).plus(boxLine.quantity),
        });
      }
    }

    for (const stock of stockQuantities.values()) {
      await restoreStock(transaction, input.organizationId, stock.stockType, stock.stockId, stock.quantity);
    }

    const detached = await transaction.finishedGoodsOutwardShipmentBox.deleteMany({
      where: { organization_id: input.organizationId, shipment_id: shipment.id },
    });
    if (detached.count !== shipment.boxes.length) throw new Error("The shipment changed before it could be reversed. Reload and try again.");

    const requestIds = new Set<string>();
    for (const { line, quantity } of lineQuantities.values()) {
      requestIds.add(line.request_id);
      if (line.shipped_quantity.lt(quantity)) throw new Error("A shipped FG quantity changed; this shipment cannot be reversed safely.");
      const shippedQuantity = line.shipped_quantity.minus(quantity);
      const otherPackedLines = await transaction.finishedGoodsOutwardBoxLine.aggregate({
        where: { organization_id: input.organizationId, request_line_id: line.id },
        _sum: { quantity: true },
      });
      const packedQuantity = otherPackedLines._sum.quantity ?? new Prisma.Decimal(0);
      const status = shippedQuantity.greaterThanOrEqualTo(line.requested_quantity)
        ? "SHIPPED"
        : packedQuantity.greaterThanOrEqualTo(line.picked_quantity)
          ? "PACKED" : "PICKED";
      const updated = await transaction.finishedGoodsOutwardRequestLine.updateMany({
        where: {
          id: line.id,
          organization_id: input.organizationId,
          shipped_quantity: line.shipped_quantity,
        },
        data: { shipped_quantity: { decrement: quantity }, status },
      });
      if (updated.count !== 1) throw new Error("An FG request line changed before shipment reversal. Reload and try again.");
    }

    await refreshRequestStatuses(transaction, input.organizationId, [...requestIds]);
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_SHIPMENT_REVERSED", entityType: "FinishedGoodsOutwardShipment",
      entityId: shipment.id,
      details: {
        packingListNo: shipment.packing_list_no,
        boxNos: shipment.boxes.map(({ box }) => box.box_no),
        stockRestored: [...stockQuantities.values()].map((stock) => ({
          stockType: stock.stockType,
          stockId: stock.stockId,
          quantity: stock.quantity.toString(),
        })),
        boxSnapshots: shipment.boxes.map(({ box_id, box }) => ({
          boxId: box_id,
          boxNo: box.box_no,
          lines: box.lines.map(({ request_line_id, quantity, requestLine }) => ({
            requestLineId: request_line_id,
            styleName: requestLine.style_name,
            articleNo: requestLine.article_no,
            orderNo: requestLine.order_no,
            brand: requestLine.brand,
            size: requestLine.size,
            colour: requestLine.colour,
            quantity: quantity.toString(),
          })),
        })),
        requestLines: [...lineQuantities.values()].map(({ line, quantity }) => ({
          requestLineId: line.id,
          styleName: line.style_name,
          quantity: quantity.toString(),
        })),
      },
    }, transaction);
    return { id: shipment.id, packing_list_no: shipment.packing_list_no, status: "REVERSED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listFinishedGoodsOutwardWorkflow(organizationId: string, actorId: string) {
  await requireOrganizationAccess(actorId, organizationId);
  const [skuRecords, generalRecords, allocatedRecords, requests, boxes, shipments, reservedLines, shipmentAudits] = await Promise.all([
    prisma.finishedGoodsSkuStock.findMany({
      where: { organization_id: organizationId, current_stock: { gt: 0 } },
      select: {
        id: true, sku_code: true, style_name: true, order_no: true, article_no: true,
        brand: true, size: true, colour: true, current_stock: true, location: { select: { location_name: true } },
      },
      orderBy: [{ added_time: "desc" }, { id: "desc" }],
    }),
    prisma.finishedGoodsGeneralStockReceipt.findMany({
      where: { organization_id: organizationId, current_stock: { gt: 0 } },
      select: {
        id: true, style_name: true, order_no: true, article_no: true, brand: true, size: true,
        colour: true, current_stock: true, location: { select: { location_name: true } },
      },
      orderBy: [{ posted_at: "desc" }, { id: "desc" }],
    }),
    prisma.finishedGoodsAllocatedStockReceipt.findMany({
      where: { organization_id: organizationId, current_stock: { gt: 0 } },
      select: {
        id: true, style_name: true, order_no: true, article_no: true, brand: true, size: true,
        colour: true, current_stock: true, location: { select: { location_name: true } },
      },
      orderBy: [{ posted_at: "desc" }, { id: "desc" }],
    }),
    prisma.finishedGoodsOutwardRequest.findMany({
      where: { organization_id: organizationId },
      include: {
        lines: {
          include: { sourceBooking: { select: outwardBookingVendorSelect } },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ requested_at: "desc" }, { id: "desc" }],
    }),
    prisma.finishedGoodsOutwardBox.findMany({
      where: { organization_id: organizationId },
      include: {
        lines: {
          include: {
            requestLine: {
              include: {
                request: { select: { request_no: true } },
                sourceBooking: { select: outwardBookingVendorSelect },
              },
            },
          },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
        },
        shipment: { include: { shipment: { select: { id: true, packing_list_no: true, shipped_at: true } } } },
      },
      orderBy: [{ packed_at: "desc" }, { id: "desc" }],
    }),
    prisma.finishedGoodsOutwardShipment.findMany({
      where: { organization_id: organizationId },
      include: { boxes: { include: { box: { select: { id: true, box_no: true } } } } },
      orderBy: [{ shipped_at: "desc" }, { id: "desc" }],
    }),
    prisma.finishedGoodsOutwardRequestLine.findMany({
      where: { organization_id: organizationId, request: { organization_id: organizationId, status: { not: "CANCELLED" } } },
      select: { source_stock_type: true, source_stock_id: true, requested_quantity: true, shipped_quantity: true },
    }),
    prisma.auditEvent.findMany({
      where: {
        organization_id: organizationId,
        module: "Inventory Management",
        action: {
          in: [
            "FG_STOCK_OUTWARD_PACKING_LIST_CREATED",
            "FG_STOCK_OUTWARD_SHIPPED",
            "FG_STOCK_OUTWARD_SHIPMENT_REVERSED",
          ],
        },
        entity_type: "FinishedGoodsOutwardShipment",
        entity_id: { not: null },
      },
      select: { entity_id: true, action: true, details: true },
    }),
  ]);

  const shippedShipmentIds = new Set(shipmentAudits.flatMap((event) =>
    event.action === "FG_STOCK_OUTWARD_SHIPPED" && event.entity_id ? [event.entity_id] : [],
  ));
  const reversedBoxesByShipment = new Map<string, string[]>();
  for (const event of shipmentAudits) {
    if (event.action !== "FG_STOCK_OUTWARD_SHIPMENT_REVERSED") continue;
    if (!event.entity_id) continue;
    const details = event.details && typeof event.details === "object" && !Array.isArray(event.details)
      ? event.details : null;
    const boxNos = details && "boxNos" in details && Array.isArray(details.boxNos)
      ? details.boxNos.filter((value): value is string => typeof value === "string") : [];
    reversedBoxesByShipment.set(event.entity_id, boxNos);
  }
  const reserved = new Map<string, Prisma.Decimal>();
  for (const line of reservedLines) {
    const key = `${line.source_stock_type}:${line.source_stock_id}`;
    reserved.set(key, (reserved.get(key) ?? new Prisma.Decimal(0))
      .plus(Prisma.Decimal.max(line.requested_quantity.minus(line.shipped_quantity), 0)));
  }
  const stock = [
    ...skuRecords.map((record) => ({
      stockType: "SKU" as const, stockBucket: "GENERAL" as const, id: record.id,
      locationName: record.location.location_name, skuCode: record.sku_code, styleName: record.style_name,
      orderNo: record.order_no, articleNo: record.article_no, brand: record.brand, size: record.size,
      colour: record.colour, currentStock: new Prisma.Decimal(record.current_stock),
    })),
    ...generalRecords.map((record) => ({
      stockType: "GENERAL" as const, stockBucket: "GENERAL" as const, id: record.id,
      locationName: record.location.location_name, skuCode: null, styleName: record.style_name,
      orderNo: record.order_no, articleNo: record.article_no ?? "", brand: record.brand, size: record.size,
      colour: record.colour, currentStock: new Prisma.Decimal(record.current_stock),
    })),
    ...allocatedRecords.map((record) => ({
      stockType: "ALLOCATED" as const, stockBucket: "ALLOCATED" as const, id: record.id,
      locationName: record.location.location_name, skuCode: null, styleName: record.style_name,
      orderNo: record.order_no, articleNo: record.article_no ?? "", brand: record.brand, size: record.size,
      colour: record.colour, currentStock: new Prisma.Decimal(record.current_stock),
    })),
  ].map((record) => ({
    ...record,
    currentStock: record.currentStock.toString(),
    availableToRequest: Prisma.Decimal.max(
      new Prisma.Decimal(record.currentStock).minus(reserved.get(`${record.stockType}:${record.id}`) ?? 0),
      0,
    ).toString(),
  }));

  const boxPayload = boxes.map((box) => {
    const lines = box.lines.map((line) => ({
      ...vendorNamesForBooking(line.requestLine.sourceBooking),
      id: line.id, requestLineId: line.request_line_id, requestNo: line.requestLine.request.request_no,
      bookingNo: line.requestLine.sourceBooking?.booking_no ?? null,
      styleName: line.requestLine.style_name, orderNo: line.requestLine.order_no,
      articleNo: line.requestLine.article_no, brand: line.requestLine.brand,
      size: line.requestLine.size, colour: line.requestLine.colour,
      quantity: line.quantity.toString(),
    }));
    const vendorSummary = (role: "bookingVendor" | "quotationVendor" | "salesOrderVendor") =>
      [...new Set(lines.map((line) => line[role]?.trim()).filter((value): value is string => Boolean(value)))].join(", ") || null;
    return {
      id: box.id, boxNo: box.box_no, packedAt: box.packed_at, packedBy: box.packed_by,
      shipment: box.shipment?.shipment
        ? { ...box.shipment.shipment, isShipped: shippedShipmentIds.has(box.shipment.shipment.id) }
        : null,
      lines,
      vendors: {
        bookingVendor: vendorSummary("bookingVendor"),
        quotationVendor: vendorSummary("quotationVendor"),
        salesOrderVendor: vendorSummary("salesOrderVendor"),
      },
    };
  });
  const boxPayloadById = new Map(boxPayload.map((box) => [box.id, box]));

  return {
    stock,
    requests: requests.map((request) => ({
      id: request.id, requestNo: request.request_no, status: request.status,
      requestedAt: request.requested_at, requestedBy: request.requested_by,
      lines: request.lines.map((line) => ({
        ...vendorNamesForBooking(line.sourceBooking),
        id: line.id, stockType: line.source_stock_type, stockId: line.source_stock_id,
        stockBucket: line.stock_bucket, locationName: line.location_name, skuCode: line.sku_code,
        styleName: line.style_name, orderNo: line.order_no, articleNo: line.article_no,
        brand: line.brand, size: line.size, colour: line.colour,
        requestedQuantity: line.requested_quantity.toString(), pickedQuantity: line.picked_quantity.toString(),
        shippedQuantity: line.shipped_quantity.toString(), status: line.status,
        pickedBy: line.picked_by, pickedAt: line.picked_at,
      })),
    })),
    boxes: boxPayload,
    shipments: shipments.map((shipment) => {
      const shipmentBoxes = shipment.boxes.map(({ box }) => boxPayloadById.get(box.id)).filter((box) => box !== undefined);
      const shipmentLines = shipmentBoxes.flatMap((box) => box.lines);
      const vendorSummary = (role: "bookingVendor" | "quotationVendor" | "salesOrderVendor") =>
        [...new Set(shipmentLines.map((line) => line[role]?.trim()).filter((value): value is string => Boolean(value)))].join(", ") || null;
      return {
        id: shipment.id, packingListNo: shipment.packing_list_no,
        shippedAt: shipment.shipped_at, shippedBy: shipment.shipped_by,
        createdAt: shipment.created_at,
        isShipped: shippedShipmentIds.has(shipment.id),
        reversed: reversedBoxesByShipment.has(shipment.id),
        vendors: {
          bookingVendor: vendorSummary("bookingVendor"),
          quotationVendor: vendorSummary("quotationVendor"),
          salesOrderVendor: vendorSummary("salesOrderVendor"),
        },
        boxes: shipment.boxes.length > 0
          ? shipment.boxes.map(({ box }) => ({ id: box.id, boxNo: box.box_no }))
          : (reversedBoxesByShipment.get(shipment.id) ?? []).map((boxNo, index) => ({
            id: `reversed:${shipment.id}:${index}`,
            boxNo,
          })),
      };
    }),
  };
}
