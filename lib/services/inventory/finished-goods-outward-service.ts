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
  const request = await transaction.finishedGoodsOutwardRequest.create({
    data: {
      organization_id: input.organizationId,
      request_no: requestNo,
      requested_by: input.actorName,
      lines: {
        create: selected.map(({ stock, quantity, sourceBookingId }) => ({
          organization_id: input.organizationId,
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
    },
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
  bookingIds: string[];
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
  const bookingIds = uniqueIds(input.bookingIds, "shipment tracking record");
  if (bookingIds.length > 200) throw new Error("Select no more than 200 shipment tracking records.");

  return prisma.$transaction(async (transaction) => {
    const bookings = await transaction.advanceBooking.findMany({
      where: { organization_id: input.organizationId, id: { in: bookingIds } },
      select: {
        id: true,
        booking_no: true,
        sizeLines: {
          select: {
            booked_quantity: true,
            assignments: { select: { assigned_quantity: true } },
          },
        },
      },
    });
    if (bookings.length !== bookingIds.length) throw new Error("One or more selected bookings were not found in this organization.");
    const notAssigned = bookings.filter((booking) =>
      booking.sizeLines.some((line) =>
        line.assignments.reduce((sum, assignment) => sum + assignment.assigned_quantity, 0) < line.booked_quantity,
      ),
    );
    if (notAssigned.length > 0) {
      throw new Error(`Assign every booked size before requesting finished goods: ${notAssigned.map((booking) => booking.booking_no).join(", ")}.`);
    }

    const stockRecords = await transaction.finishedGoodsAllocatedStockReceipt.findMany({
      where: {
        organization_id: input.organizationId,
        booking_id: { in: bookingIds },
        current_stock: { gt: 0 },
      },
      select: { id: true, booking_id: true, current_stock: true },
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
    const lines = stockRecords.flatMap((stock) => {
      const available = Prisma.Decimal.max(
        new Prisma.Decimal(stock.current_stock).minus(reservedByStock.get(stock.id) ?? 0),
        0,
      );
      return available.gt(0) ? [{
        stockType: "ALLOCATED" as const,
        stockId: stock.id,
        quantity: available.toString(),
        sourceBookingId: stock.booking_id,
      }] : [];
    });
    const bookingsWithoutBalance = bookings.filter((booking) => !lines.some((line) => line.sourceBookingId === booking.id));
    if (bookingsWithoutBalance.length > 0) {
      throw new Error(`No unreserved finished-goods balance is available for: ${bookingsWithoutBalance.map((booking) => booking.booking_no).join(", ")}.`);
    }
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
      where: { id: input.requestId, organization_id: input.organizationId, status: "REQUESTED" },
      select: { id: true, request_no: true, lines: { select: { id: true } } },
    });
    if (!request) throw new Error("Only a request awaiting acceptance can be cancelled.");
    const updated = await transaction.finishedGoodsOutwardRequest.updateMany({
      where: { id: request.id, organization_id: input.organizationId, status: "REQUESTED" },
      data: { status: "CANCELLED" },
    });
    const lines = await transaction.finishedGoodsOutwardRequestLine.updateMany({
      where: { request_id: request.id, organization_id: input.organizationId, status: "REQUESTED" },
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
  organizationId: string; requestLineIds: string[]; actorId: string; actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  const requestLineIds = uniqueIds(input.requestLineIds, "picked item");
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

    const boxNo = await reserveProcurementDocumentNumber(input.organizationId, "FG_OUTWARD_BOX", transaction);
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

export async function createFinishedGoodsOutwardShipment(input: {
  organizationId: string; boxIds: string[]; actorId: string; actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  const boxIds = uniqueIds(input.boxIds, "box");
  return prisma.$transaction(async (transaction) => {
    const boxes = await transaction.finishedGoodsOutwardBox.findMany({
      where: { id: { in: boxIds }, organization_id: input.organizationId, shipment: { is: null } },
      select: {
        id: true, box_no: true,
        lines: {
          select: {
            request_line_id: true, quantity: true,
            requestLine: {
              select: {
                id: true, request_id: true, source_stock_type: true, source_stock_id: true,
                requested_quantity: true, shipped_quantity: true, picked_quantity: true,
                style_name: true,
              },
            },
          },
        },
      },
    });
    if (boxes.length !== boxIds.length) throw new Error("One or more selected boxes are already shipped or unavailable.");
    if (boxes.some((box) => box.lines.length === 0)) throw new Error("A shipment cannot include an empty box.");

    const stockQuantities = new Map<string, { stockType: StockType; stockId: string; quantity: Prisma.Decimal }>();
    const lineQuantities = new Map<string, {
      line: (typeof boxes)[number]["lines"][number]["requestLine"];
      quantity: Prisma.Decimal;
    }>();
    for (const box of boxes) {
      for (const boxLine of box.lines) {
        const line = boxLine.requestLine;
        if (!isStockType(line.source_stock_type)) throw new Error("An FG request contains an invalid stock source.");
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

    const packingListNo = await reserveProcurementDocumentNumber(
      input.organizationId, "FG_OUTWARD_PACKING_LIST", transaction,
    );
    const shipment = await transaction.finishedGoodsOutwardShipment.create({
      data: { organization_id: input.organizationId, packing_list_no: packingListNo, shipped_by: input.actorName },
      select: { id: true, packing_list_no: true, shipped_at: true },
    });
    await transaction.finishedGoodsOutwardShipmentBox.createMany({
      data: boxes.map((box) => ({ organization_id: input.organizationId, shipment_id: shipment.id, box_id: box.id })),
    });
    await refreshRequestStatuses(transaction, input.organizationId, [...new Set(
      [...lineQuantities.values()].map(({ line }) => line.request_id),
    )]);
    await createAuditEvent({
      organizationId: input.organizationId, userId: input.actorId, module: "Inventory Management",
      action: "FG_STOCK_OUTWARD_SHIPPED", entityType: "FinishedGoodsOutwardShipment",
      entityId: shipment.id,
      details: { packingListNo, boxNos: boxes.map((box) => box.box_no), stockAdjustments },
    }, transaction);
    return { ...shipment, boxCount: boxes.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listFinishedGoodsOutwardWorkflow(organizationId: string, actorId: string) {
  await requireOrganizationAccess(actorId, organizationId);
  const [skuRecords, generalRecords, allocatedRecords, requests, boxes, shipments, reservedLines] = await Promise.all([
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
      include: { lines: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } },
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
                sourceBooking: { select: { booking_no: true } },
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
  ]);

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

  return {
    stock,
    requests: requests.map((request) => ({
      id: request.id, requestNo: request.request_no, status: request.status,
      requestedAt: request.requested_at, requestedBy: request.requested_by,
      lines: request.lines.map((line) => ({
        id: line.id, stockType: line.source_stock_type, stockId: line.source_stock_id,
        stockBucket: line.stock_bucket, locationName: line.location_name, skuCode: line.sku_code,
        styleName: line.style_name, orderNo: line.order_no, articleNo: line.article_no,
        brand: line.brand, size: line.size, colour: line.colour,
        requestedQuantity: line.requested_quantity.toString(), pickedQuantity: line.picked_quantity.toString(),
        shippedQuantity: line.shipped_quantity.toString(), status: line.status,
        pickedBy: line.picked_by, pickedAt: line.picked_at,
      })),
    })),
    boxes: boxes.map((box) => ({
      id: box.id, boxNo: box.box_no, packedAt: box.packed_at, packedBy: box.packed_by,
      shipment: box.shipment?.shipment ?? null,
      lines: box.lines.map((line) => ({
        id: line.id, requestLineId: line.request_line_id, requestNo: line.requestLine.request.request_no,
        bookingNo: line.requestLine.sourceBooking?.booking_no ?? null,
        styleName: line.requestLine.style_name, orderNo: line.requestLine.order_no,
        articleNo: line.requestLine.article_no, brand: line.requestLine.brand,
        size: line.requestLine.size, colour: line.requestLine.colour,
        quantity: line.quantity.toString(),
      })),
    })),
    shipments: shipments.map((shipment) => ({
      id: shipment.id, packingListNo: shipment.packing_list_no,
      shippedAt: shipment.shipped_at, shippedBy: shipment.shipped_by,
      boxes: shipment.boxes.map(({ box }) => ({ id: box.id, boxNo: box.box_no })),
    })),
  };
}
