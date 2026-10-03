import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
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
type ReceiptRequestBody = { organizationId?: string; purchaseOrderId?: string; locationId?: string; receivedDate?: string; notes?: string; createOnly?: boolean; lines?: ReceiptLineInput[] };

class GrnDeletionConflictError extends Error {}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    const purchaseOrderId = searchParams.get("purchaseOrderId");
    const receiptId = searchParams.get("receiptId");
    const receipts = await prisma.inventoryReceipt.findMany({
      where: { organization_id: organization.id, ...(purchaseOrderId ? { purchase_order_id: purchaseOrderId } : {}), ...(receiptId ? { id: receiptId } : {}) },
      include: {
        purchaseOrder: { select: { id: true, purchase_order_no: true, display_no: true, entity_id: true, entity: { select: { id: true, entity_name: true } } } },
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
    return receiptId || purchaseOrderId ? NextResponse.json({ receipt: receipts[0] ?? null }) : NextResponse.json({ receipts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load inventory receipts." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as ReceiptRequestBody;
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "INVENTORY"]);
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
        where: { id: purchaseOrderId, organization_id: organization.id },
        include: { lines: true, entity: { select: { id: true, is_active: true } } },
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
          || received.greaterThan(pending)
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
          location_id: location.id,
          purchase_order_id: purchaseOrder.id,
          receipt_no: await reserveChallanNumber(organization.id, "RM_GRN", transaction),
          received_date: body.receivedDate ? new Date(body.receivedDate) : new Date(),
          received_by: user.full_name || user.email,
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
    const receiptId = searchParams.get("receiptId") ?? "";
    if (!receiptId) throw new Error("A GRN is required for deletion.");

    const deletedReceipt = await prisma.$transaction(async (transaction) => {
      const receipt = await transaction.inventoryReceipt.findFirst({
        where: { id: receiptId, organization_id: organization.id },
        select: {
          id: true,
          receipt_no: true,
          purchase_order_id: true,
          entity_id: true,
          location_id: true,
          lines: { select: { id: true, raw_material: true, accepted_quantity: true } },
        },
      });
      if (!receipt) return null;

      const legacyStockToReverse = new Map<string, Prisma.Decimal>();
      const stockReversals: Array<{ raw_material: string; accepted_quantity: string }> = [];
      for (const line of receipt.lines) {
        if (!line.raw_material || !line.accepted_quantity.greaterThan(0)) continue;
        const stock = await transaction.rawMaterialStock.findFirst({
          where: { organization_id: organization.id, inventory_receipt_line_id: line.id },
          select: { id: true, quantity_on_hand: true, quantity_reserved: true },
        });
        if (!stock) {
          legacyStockToReverse.set(
            line.raw_material,
            (legacyStockToReverse.get(line.raw_material) ?? new Prisma.Decimal(0)).plus(line.accepted_quantity),
          );
          continue;
        }
        if (stock.quantity_on_hand.minus(stock.quantity_reserved).lessThan(line.accepted_quantity)) {
          throw new GrnDeletionConflictError("Cannot delete this GRN because accepted stock has since been used or reserved. Reverse that inventory activity first.");
        }

        const updated = await transaction.rawMaterialStock.updateMany({
          where: {
            id: stock.id,
            organization_id: organization.id,
            quantity_on_hand: stock.quantity_on_hand,
            quantity_reserved: stock.quantity_reserved,
          },
          data: { quantity_on_hand: { decrement: line.accepted_quantity } },
        });
        if (updated.count !== 1) {
          throw new GrnDeletionConflictError("Stock changed while deleting this GRN. Reload the record and try again.");
        }
        stockReversals.push({ raw_material: line.raw_material, accepted_quantity: line.accepted_quantity.toString() });
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
          select: { id: true, quantity_on_hand: true, quantity_reserved: true },
        });
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
        stockReversals.push({ raw_material: rawMaterial, accepted_quantity: acceptedQuantity.toString() });
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
          reversed_accepted_stock: stockReversals,
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete GRN records." }, { status: 400 });
  }
}