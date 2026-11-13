import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { saveRmGrnVerificationInTransaction } from "@/lib/services/inventory/rm-grn-verification-service";

type ReceiptLineInput = {
  purchaseOrderLineId: string;
  receivedQuantity?: number;
  acceptedQuantity?: number;
  rejectedQuantity?: number;
  verifiedQuantity?: string | number;
  approvedQuantity?: string | number;
  allocations?: Array<{ groupedPurchaseOrderId: string; verificationAllocated: string | number }>;
};
type ReceiptRequestBody = { organizationId?: string; purchaseOrderId?: string; locationId?: string; receivedDate?: string; notes?: string; createOnly?: boolean; assetPurchaseOnly?: boolean; lines?: ReceiptLineInput[] };

class GrnDeletionConflictError extends Error {}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    const purchaseOrderId = searchParams.get("purchaseOrderId");
    const receiptId = searchParams.get("receiptId");
    const assetOnlyParameter = searchParams.get("isAssetPurchase");
    if (assetOnlyParameter !== null && assetOnlyParameter !== "true" && assetOnlyParameter !== "false") {
      return NextResponse.json({ error: "Asset purchase filter must be true or false." }, { status: 400 });
    }
    const assetOnly = assetOnlyParameter === "true";
    const receipts = await prisma.inventoryReceipt.findMany({
      where: {
        organization_id: organization.id,
        ...(purchaseOrderId ? { purchase_order_id: purchaseOrderId } : {}),
        ...(receiptId ? { id: receiptId } : {}),
        ...(assetOnly ? { purchaseOrder: { is: { procurement_type: "GENERAL", is_asset_purchase: true } } } : {}),
      },
      include: {
        purchaseOrder: { select: { id: true, purchase_order_no: true, display_no: true, entity_id: true, procurement_type: true, is_asset_purchase: true, entity: { select: { id: true, entity_name: true } } } },
        entity: { select: { id: true, entity_name: true } },
        location: { select: { id: true, location_name: true } },
        lines: {
          include: {
            rmGrnVerification: { select: { id: true } },
            purchaseOrderLine: {
              select: {
                category: true,
                sub_category: true,
                source_order_no: true,
                style_name: true,
                price: true,
                gst: true,
                tax_type: true,
                cgst_rate: true,
                sgst_rate: true,
                igst_rate: true,
                cgst_amount: true,
                sgst_amount: true,
                igst_amount: true,
                hsn_code: true,
                total: true,
                masterPurchaseOrder: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { received_date: "desc" },
    });
    const serializedReceipts = receipts.map((receipt) => ({
      ...receipt,
      entity: {
        ...receipt.entity,
        entity_name: receipt.entity_name_snapshot ?? receipt.entity.entity_name,
      },
      location: {
        ...receipt.location,
        location_name: receipt.location_name_snapshot ?? receipt.location.location_name,
      },
    }));
    return receiptId || purchaseOrderId
      ? NextResponse.json({ receipt: serializedReceipts[0] ?? null })
      : NextResponse.json({ receipts: serializedReceipts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load inventory receipts." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as ReceiptRequestBody;
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "INVENTORY"]);
    if (body.assetPurchaseOnly !== undefined && typeof body.assetPurchaseOnly !== "boolean") {
      throw new Error("Asset purchase filter must be true or false.");
    }
    const purchaseOrderId = String(body.purchaseOrderId ?? "");
    const locationId = String(body.locationId ?? "");
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const createOnly = body.createOnly === true;
    if (!purchaseOrderId || !locationId || (!createOnly && lines.length === 0)) {
      throw new Error("Purchase Order and Location are required.");
    }
    const verificationMode = lines.some((line) => line.verifiedQuantity !== undefined || line.approvedQuantity !== undefined || line.allocations !== undefined);
    if (verificationMode && lines.some((line) => line.verifiedQuantity === undefined || line.approvedQuantity === undefined || !Array.isArray(line.allocations))) {
      throw new Error("Every GRN line must include Verified Qty, Approved Qty, and its grouping allocations.");
    }
    const requestedLineIds = lines.map((line) => String(line.purchaseOrderLineId));
    if (new Set(requestedLineIds).size !== requestedLineIds.length) throw new Error("A Purchase Order line can only be submitted once per GRN.");

    const receipt = await prisma.$transaction(async (transaction) => {
      const purchaseOrder = await transaction.purchaseOrder.findFirst({
        where: {
          id: purchaseOrderId,
          organization_id: organization.id,
          ...(body.assetPurchaseOnly ? { procurement_type: "GENERAL", is_asset_purchase: true } : {}),
        },
        include: { lines: true, entity: { select: { id: true, entity_name: true, is_active: true } } },
      });
      if (!purchaseOrder) throw new Error("Purchase Order not found in this organization.");
      if (!["APPROVED", "SHARED"].includes(purchaseOrder.status)) throw new Error("Only approved Purchase Orders can be received.");
      if (!purchaseOrder.entity_id || !purchaseOrder.entity?.is_active) throw new Error("This Purchase Order has no active Entity and cannot be received.");
      const location = await transaction.masterLocation.findFirst({
        where: { id: locationId, organization_id: organization.id, entity_id: purchaseOrder.entity_id, is_active: true },
        select: { id: true, entity_id: true, location_name: true },
      });
      if (!location) throw new Error("Select an active Location belonging to the Purchase Order Entity.");
      const orderLines = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
      const linesToCreate: ReceiptLineInput[] = createOnly
        ? purchaseOrder.lines.map((orderLine) => ({
            purchaseOrderLineId: orderLine.id,
            receivedQuantity: 0,
            acceptedQuantity: 0,
            rejectedQuantity: 0,
          }))
        : lines;
      if (linesToCreate.length === 0) throw new Error("The Purchase Order has no lines to attach to this GRN.");
      const existingLines = await transaction.inventoryReceiptLine.findMany({
        where: {
          purchase_order_line_id: { in: linesToCreate.map((line) => String(line.purchaseOrderLineId)) },
          receipt: { organization_id: organization.id },
        },
        select: { purchase_order_line_id: true, received_quantity: true },
      });
      const alreadyReceived = new Map<string, Prisma.Decimal>();
      for (const line of existingLines) {
        alreadyReceived.set(
          line.purchase_order_line_id,
          (alreadyReceived.get(line.purchase_order_line_id) ?? new Prisma.Decimal(0)).plus(line.received_quantity),
        );
      }
      const normalized = linesToCreate.map((line) => {
        const orderLine = orderLines.get(String(line.purchaseOrderLineId));
        if (createOnly) {
          if (!orderLine) throw new Error("One or more Purchase Order lines are unavailable.");
          return {
            orderLine,
            received: new Prisma.Decimal(0),
            accepted: new Prisma.Decimal(0),
            rejected: new Prisma.Decimal(0),
            verification: null,
          };
        }
        let received: Prisma.Decimal;
        let accepted: Prisma.Decimal;
        let rejected: Prisma.Decimal;
        try {
          received = new Prisma.Decimal(String(verificationMode ? line.verifiedQuantity : line.receivedQuantity));
          accepted = new Prisma.Decimal(String(verificationMode ? line.approvedQuantity : line.acceptedQuantity));
          rejected = verificationMode ? received.minus(accepted) : new Prisma.Decimal(String(line.rejectedQuantity));
        } catch {
          throw new Error("GRN quantities must be valid numbers.");
        }
        const pending = orderLine
          ? orderLine.quantity.minus(alreadyReceived.get(orderLine.id) ?? new Prisma.Decimal(0))
          : new Prisma.Decimal(0);
        if (
          !orderLine
          || !received.isFinite()
          || !accepted.isFinite()
          || !rejected.isFinite()
          || !received.greaterThan(0)
          || accepted.isNegative()
          || rejected.isNegative()
          || !accepted.plus(rejected).equals(received)
          || (!verificationMode && received.greaterThan(pending))
        ) {
          throw new Error("Receipt quantities exceed the pending Purchase Order quantity or are invalid.");
        }
        return {
          orderLine,
          received,
          accepted,
          rejected,
          verification: verificationMode ? {
            verifiedQuantity: received.toString(),
            approvedQuantity: accepted.toString(),
            allocations: line.allocations ?? [],
          } : null,
        };
      });
      const created = await transaction.inventoryReceipt.create({
        data: {
          organization_id: organization.id,
          entity_id: purchaseOrder.entity_id,
          entity_name_snapshot: purchaseOrder.entity.entity_name,
          location_id: location.id,
          location_name_snapshot: location.location_name,
          purchase_order_id: purchaseOrder.id,
          receipt_no: await reserveChallanNumber(organization.id, "RM_GRN", transaction),
          received_date: body.receivedDate ? new Date(body.receivedDate) : new Date(),
          received_by: user.full_name,
          notes: body.notes?.trim() || null,
          lines: { create: normalized.map(({ orderLine, received, accepted, rejected }) => ({ purchase_order_line_id: orderLine.id, raw_material: orderLine.raw_material, ordered_quantity: orderLine.quantity, received_quantity: received, accepted_quantity: accepted, rejected_quantity: rejected })) },
        },
        include: { lines: true },
      });

      if (verificationMode) {
        const verificationByPurchaseOrderLine = new Map(normalized.map((line) => [line.orderLine.id, line.verification]));
        for (const receiptLine of created.lines) {
          const verification = verificationByPurchaseOrderLine.get(receiptLine.purchase_order_line_id);
          if (!verification) throw new Error("GRN verification data is missing for a receipt line.");
          await saveRmGrnVerificationInTransaction(
            transaction,
            organization.id,
            receiptLine.id,
            verification,
            user.id,
          );
        }
      }

      const normalizedByPurchaseOrderLine = new Map(normalized.map((line) => [line.orderLine.id, line]));
      for (const receiptLine of created.lines) {
        const normalizedLine = normalizedByPurchaseOrderLine.get(receiptLine.purchase_order_line_id);
        if (!normalizedLine) throw new Error("GRN stock data is missing for a receipt line.");
        if (normalizedLine.verification) continue;
        if (!receiptLine.raw_material || !normalizedLine.accepted.greaterThan(0)) continue;
        await transaction.rawMaterialStock.create({
          data: {
            organization_id: organization.id,
            entity_id: purchaseOrder.entity_id,
            location_id: location.id,
            raw_material: receiptLine.raw_material,
            quantity_on_hand: normalizedLine.accepted,
            source_type: "GRN",
            inventory_receipt_line_id: receiptLine.id,
          },
        });
      }
      await createAuditEvent({
        organizationId: organization.id,
        userId: user.id,
        module: "Inventory Management",
        action: "CREATE",
        entityType: "InventoryReceipt",
        entityId: created.id,
        details: { receipt_no: created.receipt_no, purchase_order_id: purchaseOrderId, location_id: locationId },
      }, transaction);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, receipt }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "The Purchase Order changed while this GRN was being saved. Reload it and try again." }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to post inventory receipt." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "", ["OWNER", "ADMIN", "INVENTORY"]);
    await requireOrganizationPermission(user.id, organization.id, "DELETE_INVENTORY_RECEIPTS");
    const receiptId = searchParams.get("receiptId") ?? "";
    const assetOnlyParameter = searchParams.get("isAssetPurchase");
    if (assetOnlyParameter !== null && assetOnlyParameter !== "true" && assetOnlyParameter !== "false") {
      return NextResponse.json({ error: "Asset purchase filter must be true or false." }, { status: 400 });
    }
    if (!receiptId) throw new Error("A GRN is required for deletion.");

    const deletedReceipt = await prisma.$transaction(async (transaction) => {
      const receipt = await transaction.inventoryReceipt.findFirst({
        where: {
          id: receiptId,
          organization_id: organization.id,
          ...(assetOnlyParameter === "true" ? { purchaseOrder: { is: { procurement_type: "GENERAL", is_asset_purchase: true } } } : {}),
        },
        select: {
          id: true,
          receipt_no: true,
          purchase_order_id: true,
          entity_id: true,
          location_id: true,
          lines: {
            select: {
              id: true,
              raw_material: true,
              accepted_quantity: true,
              rmGrnVerification: {
                select: {
                  fresh_excess: true,
                  allocations: {
                    select: {
                      id: true,
                      orderAllocations: {
                        where: { organization_id: organization.id },
                        select: { id: true, grouped_purchase_order_line_id: true, allocated_quantity: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!receipt) return null;

      const legacyStockToReverse = new Map<string, Prisma.Decimal>();
      const stockReversals: Array<{ raw_material: string; quantity_reversed: string }> = [];
      const releasedStockBookings: Array<{
        stock_id: string;
        booking_count: number;
        booking_ids: string[];
        quantity_reserved_released: string;
      }> = [];
      const removedOrderAllocations = receipt.lines.flatMap((line) =>
        (line.rmGrnVerification?.allocations ?? []).flatMap((allocation) =>
          allocation.orderAllocations.map((orderAllocation) => ({
            verification_allocation_id: allocation.id,
            order_allocation_id: orderAllocation.id,
            grouped_purchase_order_line_id: orderAllocation.grouped_purchase_order_line_id,
            allocated_quantity: orderAllocation.allocated_quantity.toString(),
          })),
        ),
      );
      for (const line of receipt.lines) {
        if (!line.raw_material) continue;
        const quantityToReverse = line.rmGrnVerification?.fresh_excess ?? line.accepted_quantity;
        if (!quantityToReverse.greaterThan(0) && !line.rmGrnVerification) continue;
        const stock = await transaction.rawMaterialStock.findFirst({
          where: { organization_id: organization.id, inventory_receipt_line_id: line.id },
          select: { id: true, quantity_on_hand: true, quantity_reserved: true, quantity_issued: true },
        });
        if (!stock) {
          if (line.rmGrnVerification) continue;
          legacyStockToReverse.set(
            line.raw_material,
            (legacyStockToReverse.get(line.raw_material) ?? new Prisma.Decimal(0)).plus(quantityToReverse),
          );
          continue;
        }
        if (stock.quantity_issued.greaterThan(0)) {
          throw new GrnDeletionConflictError(
            "This GRN cannot be deleted because material has already been issued against it. Reverse or return the issued material first.",
          );
        }
        const stockBookings = await transaction.rawMaterialStockBooking.findMany({
          where: { organization_id: organization.id, take_from_stock_id: stock.id },
          select: { id: true, booked_quantity: true, fulfilled_quantity: true, status: true },
        });
        if (stockBookings.some((booking) => booking.fulfilled_quantity.greaterThan(0))) {
          throw new GrnDeletionConflictError(
            "This GRN cannot be deleted because material has already been issued against it. Reverse or return the issued material first.",
          );
        }
        const reservedBookingQuantity = stockBookings
          .filter((booking) => booking.status === "BOOKED")
          .reduce((total, booking) => total.plus(booking.booked_quantity), new Prisma.Decimal(0));
        if (!stock.quantity_reserved.equals(reservedBookingQuantity)) {
          throw new GrnDeletionConflictError(
            "Cannot safely delete this GRN because stock reservations do not match their booking records. Reconcile the reservations first.",
          );
        }
        const stockBookingIds = stockBookings.map((booking) => booking.id);
        const stockQuantityToReverse = line.rmGrnVerification
          ? stock.quantity_on_hand
          : quantityToReverse;
        if (stock.quantity_on_hand.lessThan(stockQuantityToReverse)) {
          throw new GrnDeletionConflictError("Cannot delete this GRN because accepted stock has since been used or reserved. Reverse that inventory activity first.");
        }

        const updated = await transaction.rawMaterialStock.updateMany({
          where: {
            id: stock.id,
            organization_id: organization.id,
            quantity_on_hand: stock.quantity_on_hand,
            quantity_reserved: stock.quantity_reserved,
            quantity_issued: new Prisma.Decimal(0),
          },
          data: {
            quantity_on_hand: { decrement: stockQuantityToReverse },
            quantity_reserved: { decrement: reservedBookingQuantity },
          },
        });
        if (updated.count !== 1) {
          throw new GrnDeletionConflictError("Stock changed while deleting this GRN. Reload the record and try again.");
        }
        if (stockBookingIds.length > 0) {
          const deletedBookings = await transaction.rawMaterialStockBooking.deleteMany({
            where: {
              organization_id: organization.id,
              take_from_stock_id: stock.id,
              id: { in: stockBookingIds },
            },
          });
          if (deletedBookings.count !== stockBookingIds.length) {
            throw new GrnDeletionConflictError("Stock bookings changed while deleting this GRN. Reload the record and try again.");
          }
          releasedStockBookings.push({
            stock_id: stock.id,
            booking_count: deletedBookings.count,
            booking_ids: stockBookingIds,
            quantity_reserved_released: reservedBookingQuantity.toString(),
          });
        }
        stockReversals.push({ raw_material: line.raw_material, quantity_reversed: stockQuantityToReverse.toString() });
      }

      for (const [rawMaterial, acceptedQuantity] of legacyStockToReverse) {
        const stock = await transaction.rawMaterialStock.findFirst({
          where: {
            organization_id: organization.id,
            entity_id: receipt.entity_id,
            location_id: receipt.location_id,
            raw_material: rawMaterial,
            source_type: "LEGACY",
          },
          select: { id: true, quantity_on_hand: true, quantity_reserved: true, quantity_issued: true },
        });
        if (stock?.quantity_issued.greaterThan(0)) {
          throw new GrnDeletionConflictError(
            "This GRN cannot be deleted because material has already been issued against it. Reverse or return the issued material first.",
          );
        }
        if (!stock || stock.quantity_on_hand.minus(stock.quantity_reserved).lessThan(acceptedQuantity)) {
          throw new GrnDeletionConflictError("Cannot delete this GRN because accepted stock has since been used or reserved. Reverse that inventory activity first.");
        }

        const updated = await transaction.rawMaterialStock.updateMany({
          where: {
            id: stock.id,
            organization_id: organization.id,
            quantity_on_hand: stock.quantity_on_hand,
            quantity_reserved: stock.quantity_reserved,
          },
          data: { quantity_on_hand: { decrement: acceptedQuantity } },
        });
        if (updated.count !== 1) {
          throw new GrnDeletionConflictError("Stock changed while deleting this GRN. Reload the record and try again.");
        }
        stockReversals.push({ raw_material: rawMaterial, quantity_reversed: acceptedQuantity.toString() });
      }

      await createAuditEvent({
        organizationId: organization.id,
        userId: user.id,
        module: "Inventory Management",
        action: "DELETE",
        entityType: "InventoryReceipt",
        entityId: receipt.id,
        details: {
          receipt_no: receipt.receipt_no,
          purchase_order_id: receipt.purchase_order_id,
          deleted_line_count: receipt.lines.length,
          reversed_general_inventory_stock: stockReversals,
          released_stock_bookings: releasedStockBookings,
          removed_grn_order_allocations: removedOrderAllocations,
        },
      }, transaction);

      const result = await transaction.inventoryReceipt.deleteMany({
        where: { id: receipt.id, organization_id: organization.id },
      });
      if (result.count !== 1) {
        throw new GrnDeletionConflictError("GRN changed while it was being deleted. Reload the record and try again.");
      }
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!deletedReceipt) return NextResponse.json({ error: "GRN was not found in this organization." }, { status: 404 });
    return NextResponse.json({ ok: true, receiptId: deletedReceipt.id });
  } catch (error) {
    if (error instanceof GrnDeletionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Inventory changed while deleting this GRN. Reload the record and try again." }, { status: 409 });
    }
    const denied = error instanceof Error && error.message.startsWith("Access denied:");
    return NextResponse.json(
      { error: denied ? "You do not have permission to delete inventory receipts." : error instanceof Error ? error.message : "Unable to delete GRN records." },
      { status: denied ? 403 : 400 },
    );
  }
}