import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

const zero = () => new Prisma.Decimal(0);

export async function notifyStoreForStockMasterGroup(organizationId: string, masterPurchaseOrderId: string, actorId: string) {
  return prisma.$transaction(async (transaction) => {
    const master = await transaction.masterPurchaseOrder.findFirst({
      where: { id: masterPurchaseOrderId, organization_id: organizationId },
      select: {
        id: true,
        master_po_no: true,
        display_no: true,
        status: true,
        sourceRecords: {
          select: {
            groupedPurchaseOrder: {
              select: {
                id: true,
                organization_id: true,
                source_type: true,
                status: true,
                total_grouped_qty: true,
                vendor: { select: { organization_id: true, is_current_store: true, is_active: true } },
              },
            },
          },
        },
      },
    });
    if (!master) throw new Error("Master Group not found.");

    const groups = master.sourceRecords.map(({ groupedPurchaseOrder }) => groupedPurchaseOrder);
    if (groups.length === 0 || groups.some((group) => group.organization_id !== organizationId || group.source_type !== "STOCK")) {
      throw new Error("Notify Store is available only for stock-origin Master Groups.");
    }
    if (groups.some((group) => group.status !== "MASTER_GROUPED" || group.vendor.organization_id !== organizationId || !group.vendor.is_current_store || !group.vendor.is_active)) {
      throw new Error("Every stock group must be approved, master grouped, and assigned to the active Internal Store.");
    }
    if (master.status === "STORE_NOTIFIED") {
      return { notified: false, verificationTasks: groups.length };
    }
    if (master.status !== "MASTER_GROUPED") {
      throw new Error("This stock Master Group is not ready for store verification.");
    }

    const groupedQuantities = await transaction.rawMaterialStockBooking.groupBy({
      by: ["grouped_purchase_order_id"],
      where: { organization_id: organizationId, grouped_purchase_order_id: { in: groups.map((group) => group.id) }, status: "BOOKED" },
      _sum: { booked_quantity: true },
    });
    const bookedByGroup = new Map(groupedQuantities.map((row) => [
      row.grouped_purchase_order_id,
      row._sum.booked_quantity ?? zero(),
    ]));
    if (groups.some((group) => {
      const booked = bookedByGroup.get(group.id) ?? zero();
      return !booked.gt(0) || !group.total_grouped_qty || !booked.equals(group.total_grouped_qty);
    })) {
      throw new Error("Stock reservations no longer match the approved Master Group quantities.");
    }

    const existingVerifications = await transaction.rmGrnVerification.findMany({
      where: { organization_id: organizationId, source_grouped_purchase_order_id: { in: groups.map((group) => group.id) } },
      select: { source_grouped_purchase_order_id: true },
    });
    if (existingVerifications.length > 0) {
      throw new Error("One or more stock groups already have a store verification record.");
    }

    await transaction.masterPurchaseOrder.update({
      where: { id: master.id, organization_id: organizationId },
      data: { status: "STORE_NOTIFIED" },
    });
    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "Inventory Management",
      action: "STORE_NOTIFIED",
      entityType: "MasterPurchaseOrder",
      entityId: master.id,
      details: {
        master_group_no: master.display_no ? `MGP-${master.display_no}` : master.master_po_no,
        stock_group_count: groups.length,
        stock_grouped_purchase_order_ids: groups.map((group) => group.id),
      },
    }, transaction);

    return { notified: true, verificationTasks: groups.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function formatGroupedPoNumber(displayNo: number | null, internalNo: string) {
  return displayNo ? `GP-${displayNo}` : internalNo;
}

function formatMasterGroupNumber(displayNo: number | null, internalNo: string) {
  return displayNo ? `MGP-${displayNo}` : internalNo;
}

function totalBookedQuantity(bookings: Array<{ booked_quantity: Prisma.Decimal }>) {
  return bookings.reduce((total, booking) => total.plus(booking.booked_quantity), zero());
}

export async function listPendingStockVerificationTasks(organizationId: string) {
  const masters = await prisma.masterPurchaseOrder.findMany({
    where: { organization_id: organizationId, status: "STORE_NOTIFIED" },
    select: {
      id: true,
      master_po_no: true,
      display_no: true,
      created_at: true,
      entity: { select: { entity_name: true } },
      sourceRecords: {
        select: {
          groupedPurchaseOrder: {
            select: {
              id: true,
              organization_id: true,
              source_type: true,
              grouped_po_no: true,
              display_no: true,
              raw_material: true,
              category: true,
              sub_category: true,
              total_grouped_qty: true,
              stockBookings: {
                where: { organization_id: organizationId, status: "BOOKED" },
                select: { booked_quantity: true },
              },
            },
          },
        },
      },
    },
    orderBy: { created_at: "asc" },
  });
  const stockGroups = masters.flatMap((master) => master.sourceRecords
    .map(({ groupedPurchaseOrder }) => ({ master, group: groupedPurchaseOrder }))
    .filter(({ group }) => group.organization_id === organizationId && group.source_type === "STOCK"));
  const groupIds = stockGroups.map(({ group }) => group.id);
  if (groupIds.length === 0) return [];

  const completed = await prisma.rmGrnVerification.findMany({
    where: { organization_id: organizationId, source_grouped_purchase_order_id: { in: groupIds } },
    select: { source_grouped_purchase_order_id: true },
  });
  const completedIds = new Set(completed.map((record) => record.source_grouped_purchase_order_id));

  return stockGroups.flatMap(({ master, group }) => {
    if (completedIds.has(group.id)) return [];
    const expected = totalBookedQuantity(group.stockBookings);
    if (!expected.gt(0)) return [];
    return [{
      sourceGroupedPurchaseOrderId: group.id,
      masterPurchaseOrderId: master.id,
      masterGroupingNumber: formatMasterGroupNumber(master.display_no, master.master_po_no),
      groupingNumber: formatGroupedPoNumber(group.display_no, group.grouped_po_no),
      stockReference: `STOCK-${formatGroupedPoNumber(group.display_no, group.grouped_po_no)}`,
      rawMaterialName: group.raw_material ?? "",
      category: group.category,
      subCategory: group.sub_category,
      entityName: master.entity?.entity_name ?? "Missing Entity",
      expectedQuantity: expected.toString(),
      createdAt: master.created_at,
    }];
  });
}

export async function getStockVerificationDetails(organizationId: string, groupedPurchaseOrderId: string) {
  const group = await prisma.groupedPurchaseOrder.findFirst({
    where: { id: groupedPurchaseOrderId, organization_id: organizationId, source_type: "STOCK" },
    select: {
      id: true,
      organization_id: true,
      grouped_po_no: true,
      display_no: true,
      raw_material: true,
      category: true,
      sub_category: true,
      total_grouped_qty: true,
      status: true,
      stockBookings: {
        where: { organization_id: organizationId, status: "BOOKED" },
        select: { booked_quantity: true },
      },
      masterGroupSource: {
        select: {
          masterPurchaseOrder: {
            select: {
              id: true,
              organization_id: true,
              master_po_no: true,
              display_no: true,
              total_grouped_qty: true,
              status: true,
            },
          },
        },
      },
    },
  });
  const master = group?.masterGroupSource?.masterPurchaseOrder;
  if (!group || !master || master.organization_id !== organizationId || master.status !== "STORE_NOTIFIED" || group.status !== "MASTER_GROUPED") {
    return null;
  }
  const existing = await prisma.rmGrnVerification.findFirst({
    where: { organization_id: organizationId, source_grouped_purchase_order_id: group.id },
    select: { id: true },
  });
  if (existing) return null;

  const expected = totalBookedQuantity(group.stockBookings);
  if (!expected.gt(0) || !group.total_grouped_qty || !expected.equals(group.total_grouped_qty)) return null;
  const groupingNumber = formatGroupedPoNumber(group.display_no, group.grouped_po_no);
  return {
    receiptLineId: null,
    sourceGroupedPurchaseOrderId: group.id,
    isStockIssue: true,
    masterPurchaseOrderId: master.id,
    grnNumber: `STOCK-${groupingNumber}`,
    rawMaterialName: group.raw_material ?? "",
    grnQuantity: expected.toString(),
    purchaseOrderNumber: "Internal Store Issue",
    masterGroupingNumber: formatMasterGroupNumber(master.display_no, master.master_po_no),
    poQuantity: master.total_grouped_qty?.toString() ?? expected.toString(),
    groupedQtyGrn: expected.toString(),
    verifiedQuantity: "",
    approvedQuantity: "",
    rejectedQuantity: "0",
    freshExcess: "0",
    totalExcess: "0",
    availableToAllocate: "0",
    groupedAllocated: "0",
    groupedBalanceToAllocate: expected.toString(),
    allocations: [{
      groupedPurchaseOrderId: group.id,
      groupingNumber,
      totalGroupedQty: expected.toString(),
      verificationAllocated: "0",
      balanceToAllocate: expected.toString(),
    }],
  };
}

  function parseCount(value: unknown) {
    if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || String(value).length > 64) {
      throw new Error("Enter valid non-negative quantities with up to two decimal places.");
    }
    let parsed: Prisma.Decimal;
    try {
      parsed = new Prisma.Decimal(String(value).trim());
    } catch {
      throw new Error("Enter valid non-negative quantities with up to two decimal places.");
    }
    if (!parsed.isFinite() || parsed.isNegative() || parsed.decimalPlaces() > 2 || parsed.greaterThan("999999999999.99")) {
      throw new Error("Enter valid non-negative quantities with up to two decimal places.");
    }
    return parsed;
  }

  export async function saveStockGroupVerification(
    organizationId: string,
    groupedPurchaseOrderId: string,
    input: { verifiedQuantity: unknown; approvedQuantity: unknown },
    actorId: string,
  ) {
    const verified = parseCount(input.verifiedQuantity);
    const approved = parseCount(input.approvedQuantity);
    if (approved.gt(verified)) throw new Error("Approved Qty cannot exceed Verified Qty.");

    return prisma.$transaction(async (transaction) => {
      const group = await transaction.groupedPurchaseOrder.findFirst({
        where: { id: groupedPurchaseOrderId, organization_id: organizationId, source_type: "STOCK", status: "MASTER_GROUPED" },
        select: {
          id: true,
          organization_id: true,
          grouped_po_no: true,
          total_grouped_qty: true,
          lines: { orderBy: [{ created_at: "asc" }, { id: "asc" }], select: { source_bom_item_id: true, grouped_qty: true } },
          masterGroupSource: {
            select: {
              masterPurchaseOrder: {
                select: { id: true, organization_id: true, status: true, total_grouped_qty: true },
              },
            },
          },
        },
      });
      const master = group?.masterGroupSource?.masterPurchaseOrder;
      if (!group || !master || master.organization_id !== organizationId || master.status !== "STORE_NOTIFIED") {
        throw new Error("This stock group is not awaiting store verification.");
      }
      const existing = await transaction.rmGrnVerification.findFirst({
        where: { organization_id: organizationId, source_grouped_purchase_order_id: group.id },
        select: { id: true },
      });
      if (existing) throw new Error("This stock group has already been verified.");

      const bookings = await transaction.rawMaterialStockBooking.findMany({
        where: { organization_id: organizationId, grouped_purchase_order_id: group.id, status: "BOOKED" },
        select: {
          id: true,
          source_bom_item_id: true,
          take_from_stock_id: true,
          booked_quantity: true,
          takeFromStock: { select: { id: true, quantity_on_hand: true, quantity_reserved: true } },
        },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      });
      const expected = bookings.reduce((total, booking) => total.plus(booking.booked_quantity), zero());
      if (bookings.length === 0 || !expected.gt(0) || !group.total_grouped_qty || !expected.equals(group.total_grouped_qty)) {
        throw new Error("Stock reservations no longer match the approved Grouped PO quantity.");
      }
      if (verified.gt(expected)) throw new Error("Verified Qty cannot exceed the stock reserved for this group.");
      if (approved.gt(expected)) throw new Error("Approved Qty cannot exceed the stock reserved for this group.");

      const bookingsByBomItem = new Map<string, typeof bookings>();
      for (const booking of bookings) {
        const lines = bookingsByBomItem.get(booking.source_bom_item_id) ?? [];
        lines.push(booking);
        bookingsByBomItem.set(booking.source_bom_item_id, lines);
      }
      const stockChanges = new Map<string, {
        stock: typeof bookings[number]["takeFromStock"];
        reserved: Prisma.Decimal;
        issued: Prisma.Decimal;
      }>();
      const fulfilledByBookingId = new Map(bookings.map((booking) => [booking.id, zero()]));
      let remainingApproved = approved;
      for (const line of group.lines) {
        const lineBookings = bookingsByBomItem.get(line.source_bom_item_id) ?? [];
        const lineBooked = lineBookings.reduce((total, booking) => total.plus(booking.booked_quantity), zero());
        if (!lineBooked.equals(line.grouped_qty)) throw new Error("Stock bookings no longer match the Master Group style quantities.");

        const lineApproved = Prisma.Decimal.min(remainingApproved, line.grouped_qty);
        remainingApproved = remainingApproved.minus(lineApproved);
        let remainingLineApproved = lineApproved;
        for (const booking of lineBookings) {
          const change = stockChanges.get(booking.take_from_stock_id) ?? {
            stock: booking.takeFromStock,
            reserved: zero(),
            issued: zero(),
          };
          const issuedFromBooking = Prisma.Decimal.min(remainingLineApproved, booking.booked_quantity);
          change.reserved = change.reserved.plus(booking.booked_quantity);
          change.issued = change.issued.plus(issuedFromBooking);
          fulfilledByBookingId.set(booking.id, issuedFromBooking);
          remainingLineApproved = remainingLineApproved.minus(issuedFromBooking);
          stockChanges.set(booking.take_from_stock_id, change);
        }
        if (!remainingLineApproved.isZero()) throw new Error("Approved quantities exceed the stock booked for a style line.");
      }
      if (!remainingApproved.isZero()) throw new Error("Approved Qty cannot exceed the stock reserved for this group.");

      for (const [stockId, change] of stockChanges) {
        const updated = await transaction.rawMaterialStock.updateMany({
          where: {
            id: stockId,
            organization_id: organizationId,
            quantity_reserved: { gte: change.reserved },
            quantity_on_hand: { gte: change.issued },
          },
          data: {
            quantity_reserved: { decrement: change.reserved },
            quantity_on_hand: { decrement: change.issued },
            quantity_issued: { increment: change.issued },
          },
        });
        if (updated.count !== 1) throw new Error("Reserved stock changed before verification was submitted. Reload and try again.");
      }
      for (const booking of bookings) {
        const completedBooking = await transaction.rawMaterialStockBooking.updateMany({
          where: { id: booking.id, organization_id: organizationId, status: "BOOKED" },
          data: { status: "FULFILLED", fulfilled_quantity: fulfilledByBookingId.get(booking.id) ?? zero() },
        });
        if (completedBooking.count !== 1) throw new Error("Stock bookings changed before verification was submitted. Reload and try again.");
      }

      const rejected = verified.minus(approved);
      const record = await transaction.rmGrnVerification.create({
        data: {
          organization_id: organizationId,
          inventory_receipt_line_id: null,
          source_grouped_purchase_order_id: group.id,
          master_purchase_order_id: master.id,
          po_quantity: master.total_grouped_qty ?? expected,
          grouped_qty_grn: expected,
          verified_quantity: verified,
          approved_quantity: approved,
          rejected_quantity: rejected,
          fresh_excess: zero(),
          total_excess: rejected,
          available_to_allocate: approved,
          grouped_allocated: approved,
          grouped_balance_to_allocate: expected.minus(approved),
          created_by: actorId,
          updated_by: actorId,
        },
      });
      if (approved.gt(0)) {
        await transaction.rmGrnVerificationAllocation.create({
          data: {
            organization_id: organizationId,
            verification_id: record.id,
            grouped_purchase_order_id: group.id,
            verification_allocated: approved,
          },
        });
      }
      await transaction.groupedPurchaseOrder.update({
        where: { id: group.id, organization_id: organizationId },
        data: { status: "STOCK_ALLOCATED" },
      });

      const sourceGroups = await transaction.masterPurchaseOrderSource.findMany({
        where: { master_purchase_order_id: master.id },
        select: { grouped_purchase_order_id: true },
      });
      const completedVerifications = await transaction.rmGrnVerification.findMany({
        where: {
          organization_id: organizationId,
          source_grouped_purchase_order_id: { in: sourceGroups.map((source) => source.grouped_purchase_order_id) },
        },
        select: { source_grouped_purchase_order_id: true },
      });
      const completedGroupIds = new Set(completedVerifications.map((verification) => verification.source_grouped_purchase_order_id));
      const allGroupsCompleted = sourceGroups.length > 0 && sourceGroups.every((source) => completedGroupIds.has(source.grouped_purchase_order_id));
      if (allGroupsCompleted) {
        await transaction.masterPurchaseOrder.update({
          where: { id: master.id, organization_id: organizationId, status: "STORE_NOTIFIED" },
          data: { status: "STOCK_ALLOCATED" },
        });
      }

      await createAuditEvent({
        organizationId,
        userId: actorId,
        module: "Inventory Management",
        action: "STORE_VERIFICATION_SUBMITTED",
        entityType: "RmGrnVerification",
        entityId: record.id,
        details: {
          master_group_id: master.id,
          grouped_purchase_order_id: group.id,
          expected_quantity: expected.toString(),
          verified_quantity: verified.toString(),
          approved_quantity: approved.toString(),
          rejected_quantity: rejected.toString(),
          allocated_quantity: approved.toString(),
          master_group_completed: allGroupsCompleted,
        },
      }, transaction);

      if (allGroupsCompleted) {
        await createAuditEvent({
          organizationId,
          userId: actorId,
          module: "Inventory Management",
          action: "STOCK_ALLOCATED",
          entityType: "MasterPurchaseOrder",
          entityId: master.id,
          details: { grouped_purchase_order_ids: sourceGroups.map((source) => source.grouped_purchase_order_id) },
        }, transaction);
      }

      return {
        created: true,
        verificationId: record.id,
        verifiedQuantity: verified.toString(),
        approvedQuantity: approved.toString(),
        rejectedQuantity: rejected.toString(),
        groupedAllocated: approved.toString(),
        masterGroupCompleted: allGroupsCompleted,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }