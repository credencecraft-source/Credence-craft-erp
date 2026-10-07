import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

const quotationInclude = {
  lines: { orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }] },
};

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function mapQuotation(record: Prisma.DistributionQuotationGetPayload<{ include: typeof quotationInclude }>) {
  return {
    id: record.id,
    quotationNo: record.quotation_no,
    quotationDate: record.quotation_date.toISOString().slice(0, 10),
    validUntil: record.valid_until?.toISOString().slice(0, 10) ?? "",
    orderNo: record.order_no,
    vendorId: record.vendor_id,
    customer: record.customer,
    notes: record.notes ?? "",
    mode: record.mode,
    status: record.status,
    totalQuantity: record.total_quantity,
    subtotal: record.subtotal.toFixed(2),
    parentQuotationId: record.parent_quotation_id,
    createdAt: record.created_at.toISOString(),
    lines: record.lines.map((line) => ({
      id: line.id,
      sourceBookingSizeId: line.source_booking_size_id,
      bookingNo: line.booking_no,
      orderNo: line.order_no,
      description: line.item_description,
      brand: line.brand ?? "",
      styleName: line.style_name ?? "",
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.unit_price.toFixed(4),
      lineTotal: line.line_total.toFixed(2),
    })),
  };
}

export async function listDistributionQuotations(organizationId: string) {
  const quotations = await prisma.distributionQuotation.findMany({
    where: { organization_id: organizationId },
    include: quotationInclude,
    orderBy: [{ quotation_date: "desc" }, { created_at: "desc" }],
    take: 500,
  });
  return { quotations: quotations.map(mapQuotation) };
}

export async function getDistributionQuotation(organizationId: string, quotationId: string) {
  const quotation = await prisma.distributionQuotation.findFirst({
    where: { organization_id: organizationId, id: quotationId },
    include: { ...quotationInclude, childQuotations: { include: quotationInclude } },
  });
  if (!quotation) throw new Error("The quotation was not found in this organization.");
  return {
    quotation: mapQuotation(quotation),
    children: quotation.childQuotations.map(mapQuotation),
  };
}

export async function createDistributionQuotationFromBookings(
  organizationId: string,
  userId: string,
  bookingIds: string[],
) {
  if (bookingIds.length === 0 || bookingIds.length > 100) {
    throw new Error("Select between one and 100 advance bookings for a quotation.");
  }
  if (bookingIds.some((id) => !id.trim()) || new Set(bookingIds).size !== bookingIds.length) {
    throw new Error("Each advance booking can only be included once in a quotation.");
  }

  const created = await prisma.$transaction(async (transaction) => {
    const bookings = await transaction.advanceBooking.findMany({
      where: { organization_id: organizationId, id: { in: bookingIds } },
      include: {
        order: { select: { orderNo: true } },
        sizeLines: { orderBy: [{ size: "asc" }, { id: "asc" }] },
      },
    });
    if (bookings.length !== bookingIds.length) {
      throw new Error("One or more selected bookings are unavailable in this organization.");
    }
    const orderedBookings = bookingIds.map((id) => bookings.find((booking) => booking.id === id)!);
    const vendorId = orderedBookings[0].vendor_id;
    const customer = orderedBookings[0].customer;
    if (orderedBookings.some((booking) => booking.vendor_id !== vendorId || booking.customer !== customer)) {
      throw new Error("Select advance bookings for the same Vendor Master vendor.");
    }
    const sourceIds = orderedBookings.flatMap((booking) => booking.sizeLines.map((line) => line.id));
    const previouslyQuoted = await transaction.distributionQuotationLine.findFirst({
      where: { organization_id: organizationId, source_booking_size_id: { in: sourceIds } },
      select: { booking_no: true },
    });
    if (previouslyQuoted) {
      throw new Error(`Booking ${previouslyQuoted.booking_no} already has a quotation. Use that quotation instead of creating a duplicate.`);
    }

    const totalQuantity = orderedBookings.reduce(
      (sum, booking) => sum + booking.sizeLines.reduce((lineSum, line) => lineSum + line.booked_quantity, 0),
      0,
    );
    if (!Number.isSafeInteger(totalQuantity) || totalQuantity <= 0) {
      throw new Error("The selected bookings must have a positive, supported total quantity.");
    }
    const orderNumbers = [...new Set(orderedBookings.map((booking) => booking.order.orderNo))];
    const combinedOrderNumbers = orderNumbers.join(", ");
    if (combinedOrderNumbers.length > 1000) throw new Error("The selected source order numbers exceed the quotation header limit.");
    const quotationLines = orderedBookings.flatMap((booking) => booking.sizeLines.map((line) => {
      const itemDescription = [booking.brand, booking.style_name].filter(Boolean).join(" ");
      if (itemDescription.length > 500) {
        throw new Error(`Booking ${booking.booking_no} has a description that exceeds the quotation line limit.`);
      }
      return {
        organization_id: organizationId,
        source_booking_size_id: line.id,
        booking_no: booking.booking_no,
        order_no: booking.order.orderNo,
        item_description: itemDescription,
        brand: booking.brand,
        style_name: booking.style_name,
        size: line.size,
        quantity: line.booked_quantity,
        unit_price: new Prisma.Decimal(0),
        line_total: new Prisma.Decimal(0),
      };
    }));
    const quotation = await transaction.distributionQuotation.create({
      data: {
        organization_id: organizationId,
        vendor_id: vendorId,
        quotation_no: await reserveProcurementDocumentNumber(organizationId, "DISTRIBUTION_QUOTATION", transaction),
        quotation_date: new Date(),
        order_no: combinedOrderNumbers,
        customer,
        mode: orderedBookings.length === 1 ? "SINGLE" : "MULTIPLE",
        status: "DRAFT",
        total_quantity: totalQuantity,
        subtotal: new Prisma.Decimal(0),
        created_by: userId,
        lines: { create: quotationLines },
      },
      include: quotationInclude,
    });
    await createAuditEvent({
      organizationId,
      userId,
      module: "Distribution",
      action: "CREATE_DISTRIBUTION_QUOTATION",
      entityType: "DistributionQuotation",
      entityId: quotation.id,
      details: {
        quotation_no: quotation.quotation_no,
        booking_nos: orderedBookings.map((booking) => booking.booking_no),
        vendor_id: vendorId,
        total_quantity: totalQuantity,
      },
    }, transaction);
    return quotation;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return mapQuotation(created);
}

export async function saveDistributionQuotationDraft(
  organizationId: string,
  userId: string,
  quotationId: string,
  input: {
    quotationDate: string;
    validUntil: string;
    notes: string;
    lines: Array<{ id: string; unitPrice: string }>;
  },
) {
  if (!isValidDateOnly(input.quotationDate)) throw new Error("Enter a valid quotation date.");
  if (input.validUntil && !isValidDateOnly(input.validUntil)) throw new Error("Enter a valid quotation validity date.");
  if (input.validUntil && input.validUntil < input.quotationDate) throw new Error("The validity date cannot be earlier than the quotation date.");
  if (input.notes.length > 2000) throw new Error("Quotation notes cannot exceed 2,000 characters.");
  if (input.lines.length === 0 || input.lines.length > 500) throw new Error("The quotation must contain valid detail lines.");
  if (input.lines.some((line) => !line.id.trim()) || new Set(input.lines.map((line) => line.id)).size !== input.lines.length) {
    throw new Error("Each quotation detail line must be included once.");
  }
  const prices = input.lines.map(({ unitPrice }) => {
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(unitPrice)) throw new Error("Each unit price must be a non-negative amount with up to four decimal places.");
    return new Prisma.Decimal(unitPrice);
  });

  const record = await prisma.$transaction(async (transaction) => {
    const current = await transaction.distributionQuotation.findFirst({
      where: { organization_id: organizationId, id: quotationId },
      include: quotationInclude,
    });
    if (!current) throw new Error("The quotation was not found in this organization.");
    if (current.status !== "DRAFT" || current.mode === "MASTER") {
      throw new Error("Only draft regular quotations can be edited.");
    }
    if (current.lines.length !== input.lines.length ||
        current.lines.some((line) => !input.lines.some((entry) => entry.id === line.id))) {
      throw new Error("Quotation detail lines changed. Reload the quotation before saving.");
    }

    let subtotal = new Prisma.Decimal(0);
    for (const line of current.lines) {
      const priceIndex = input.lines.findIndex((entry) => entry.id === line.id);
      const unitPrice = prices[priceIndex];
      const lineTotal = unitPrice.mul(line.quantity).toDecimalPlaces(2);
      subtotal = subtotal.add(lineTotal);
      const lineUpdate = await transaction.distributionQuotationLine.updateMany({
        where: { organization_id: organizationId, quotation_id: current.id, id: line.id },
        data: { unit_price: unitPrice, line_total: lineTotal },
      });
      if (lineUpdate.count !== 1) throw new Error("A quotation detail line changed. Reload the quotation before saving.");
    }
    const quotationUpdate = await transaction.distributionQuotation.updateMany({
      where: { organization_id: organizationId, id: current.id, status: "DRAFT" },
      data: {
        quotation_date: new Date(`${input.quotationDate}T00:00:00.000Z`),
        valid_until: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
        notes: input.notes.trim() || null,
        subtotal,
      },
    });
    if (quotationUpdate.count !== 1) throw new Error("The draft quotation changed. Reload it before saving.");
    const updated = await transaction.distributionQuotation.findFirst({
      where: { organization_id: organizationId, id: current.id },
      include: quotationInclude,
    });
    if (!updated) throw new Error("The quotation could not be reloaded after saving.");
    await createAuditEvent({
      organizationId,
      userId,
      module: "Distribution",
      action: "UPDATE_DISTRIBUTION_QUOTATION_DRAFT",
      entityType: "DistributionQuotation",
      entityId: current.id,
      details: {
        quotation_no: current.quotation_no,
        status: current.status,
        before_subtotal: current.subtotal.toFixed(2),
        after_subtotal: updated.subtotal.toFixed(2),
      },
    }, transaction);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return mapQuotation(record);
}

export async function createDistributionMasterQuotation(
  organizationId: string,
  userId: string,
  quotationIds: string[],
) {
  if (quotationIds.length < 2 || quotationIds.length > 100) {
    throw new Error("Select between two and 100 regular quotations for a master quotation.");
  }
  if (new Set(quotationIds).size !== quotationIds.length || quotationIds.some((id) => !id.trim())) {
    throw new Error("Each regular quotation can only be included once.");
  }
  const record = await prisma.$transaction(async (transaction) => {
    const children = await transaction.distributionQuotation.findMany({
      where: {
        organization_id: organizationId,
        id: { in: quotationIds },
        parent_quotation_id: null,
        mode: { in: ["SINGLE", "MULTIPLE"] },
      },
      include: quotationInclude,
    });
    if (children.length !== quotationIds.length) {
      throw new Error("One or more selected quotations are unavailable or already grouped.");
    }
    const orderedChildren = quotationIds.map((id) => children.find((child) => child.id === id)!);
    const totalQuantity = orderedChildren.reduce((sum, child) => sum + child.total_quantity, 0);
    if (!Number.isSafeInteger(totalQuantity)) throw new Error("The selected quotation quantities exceed the supported total.");
    const orderNumbers = [...new Set(orderedChildren.flatMap((child) => child.order_no.split(",").map((value) => value.trim()).filter(Boolean)))];
    const customers = [...new Set(orderedChildren.map((child) => child.customer))];
    const subtotal = orderedChildren.reduce((sum, child) => sum.add(child.subtotal), new Prisma.Decimal(0));
    const master = await transaction.distributionQuotation.create({
      data: {
        organization_id: organizationId,
        quotation_no: await reserveProcurementDocumentNumber(organizationId, "DISTRIBUTION_MASTER_QUOTATION", transaction),
        quotation_date: new Date(),
        order_no: orderNumbers.join(", "),
        customer: customers.length === 1 ? customers[0] : "Multiple customers",
        mode: "MASTER",
        status: "DRAFT",
        total_quantity: totalQuantity,
        subtotal,
        created_by: userId,
      },
      include: quotationInclude,
    });
    const linked = await transaction.distributionQuotation.updateMany({
      where: {
        organization_id: organizationId,
        id: { in: quotationIds },
        parent_quotation_id: null,
        mode: { in: ["SINGLE", "MULTIPLE"] },
      },
      data: { parent_quotation_id: master.id },
    });
    if (linked.count !== quotationIds.length) throw new Error("Selected quotations changed. Reload and try again.");
    await createAuditEvent({
      organizationId,
      userId,
      module: "Distribution",
      action: "CREATE_DISTRIBUTION_MASTER_QUOTATION",
      entityType: "DistributionQuotation",
      entityId: master.id,
      details: {
        quotation_no: master.quotation_no,
        child_quotation_nos: orderedChildren.map((child) => child.quotation_no),
        total_quantity: totalQuantity,
      },
    }, transaction);
    return master;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return mapQuotation(record);
}
