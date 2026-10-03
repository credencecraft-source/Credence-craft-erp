import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";

const SAMPLE_GRN_COUNT = 5;
const ZERO = new Prisma.Decimal(0);

export async function createDummySampleGrns(
  organizationId: string,
  purchaseOrderIds: string[],
  batchId: string,
  actorId: string,
) {
  if (purchaseOrderIds.length < 10) {
    throw new Error("At least ten approved sample Purchase Orders are required before creating sample GRNs.");
  }

  const selectedPurchaseOrderIds = purchaseOrderIds.slice(0, SAMPLE_GRN_COUNT);
  const receipts: Array<{ id: string; purchaseOrderId: string }> = [];
  for (const [index, purchaseOrderId] of selectedPurchaseOrderIds.entries()) {
    const receipt = await prisma.$transaction(async (transaction) => {
      const notes = `Dummy sample batch ${batchId}`;
      const existing = await transaction.inventoryReceipt.findFirst({
        where: {
          organization_id: organizationId,
          purchase_order_id: purchaseOrderId,
          notes,
        },
        select: { id: true, purchase_order_id: true },
      });
      if (existing) {
        if (existing.purchase_order_id !== purchaseOrderId) {
          throw new Error("An existing sample GRN is not linked to its expected Purchase Order.");
        }
        return { id: existing.id, purchaseOrderId };
      }

      const purchaseOrder = await transaction.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, organization_id: organizationId },
        include: {
          entity: { select: { id: true, entity_name: true, is_active: true } },
          lines: true,
        },
      });
      if (!purchaseOrder || !["APPROVED", "SHARED"].includes(purchaseOrder.status)) {
        throw new Error("Only approved sample Purchase Orders can receive a sample GRN.");
      }
      if (!purchaseOrder.entity_id || !purchaseOrder.entity?.is_active) {
        throw new Error("The sample Purchase Order does not have an active Entity for GRN creation.");
      }
      if (purchaseOrder.lines.length === 0) {
        throw new Error(`Sample Purchase Order ${purchaseOrder.purchase_order_no} has no receipt lines.`);
      }

      const existingReceipts = await transaction.inventoryReceiptLine.findMany({
        where: {
          purchase_order_line_id: { in: purchaseOrder.lines.map((line) => line.id) },
          receipt: { organization_id: organizationId },
        },
        select: { purchase_order_line_id: true, received_quantity: true },
      });
      const receivedByPurchaseOrderLine = new Map<string, Prisma.Decimal>();
      for (const line of existingReceipts) {
        receivedByPurchaseOrderLine.set(
          line.purchase_order_line_id,
          (receivedByPurchaseOrderLine.get(line.purchase_order_line_id) ?? ZERO).plus(line.received_quantity),
        );
      }

      const location = await findOrCreateSampleReceivingLocation(
        transaction,
        organizationId,
        purchaseOrder.entity_id,
        purchaseOrder.entity.entity_name,
        actorId,
      );
      const receiptLines = purchaseOrder.lines.map((line) => {
        const pendingQuantity = line.quantity.minus(receivedByPurchaseOrderLine.get(line.id) ?? ZERO);
        if (!pendingQuantity.greaterThan(0)) {
          throw new Error(`Sample Purchase Order ${purchaseOrder.purchase_order_no} has no pending quantity for GRN creation.`);
        }
        const partialQuantity = pendingQuantity.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        const receivedQuantity = index % 2 === 0 && partialQuantity.greaterThan(0)
          ? partialQuantity
          : pendingQuantity;
        if (!receivedQuantity.greaterThan(0)) {
          throw new Error(`Sample Purchase Order ${purchaseOrder.purchase_order_no} has an invalid partial receipt quantity.`);
        }
        return {
          purchase_order_line_id: line.id,
          raw_material: line.raw_material,
          ordered_quantity: line.quantity,
          received_quantity: receivedQuantity,
          accepted_quantity: receivedQuantity,
          rejected_quantity: ZERO,
        };
      });

      const created = await transaction.inventoryReceipt.create({
        data: {
          organization_id: organizationId,
          entity_id: purchaseOrder.entity_id,
          location_id: location.id,
          purchase_order_id: purchaseOrder.id,
          receipt_no: await reserveChallanNumber(organizationId, "RM_GRN", transaction),
          received_by: actorId,
          notes,
          lines: { create: receiptLines },
        },
        select: { id: true, receipt_no: true },
      });
      await createAuditEvent({
        organizationId,
        userId: actorId,
        module: "Inventory Management",
        action: "CREATE_DUMMY_RM_GRN",
        entityType: "InventoryReceipt",
        entityId: created.id,
        details: {
          batch_id: batchId,
          receipt_no: created.receipt_no,
          purchase_order_id: purchaseOrder.id,
          location_id: location.id,
          partial: index % 2 === 0,
        },
      }, transaction);
      return { id: created.id, purchaseOrderId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    receipts.push(receipt);
  }

  if (
    receipts.length !== SAMPLE_GRN_COUNT
    || new Set(receipts.map((receipt) => receipt.purchaseOrderId)).size !== SAMPLE_GRN_COUNT
  ) {
    throw new Error("Five sample GRNs linked to five different Purchase Orders are required.");
  }
  return receipts;
}

async function findOrCreateSampleReceivingLocation(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  entityId: string,
  entityName: string,
  actorId: string,
) {
  const activeLocation = await transaction.masterLocation.findFirst({
    where: { organization_id: organizationId, entity_id: entityId, is_active: true },
    select: { id: true },
  });
  if (activeLocation) return activeLocation;

  const suffix = entityId.slice(0, 8);
  const prefix = `Sample Receiving - ${entityName}`.slice(0, 255 - suffix.length - 3);
  const locationName = `${prefix} - ${suffix}`;
  const inactiveLocation = await transaction.masterLocation.findFirst({
    where: { organization_id: organizationId, entity_id: entityId, location_name: locationName },
    select: { id: true },
  });
  if (inactiveLocation) {
    const activated = await transaction.masterLocation.updateMany({
      where: { id: inactiveLocation.id, organization_id: organizationId, entity_id: entityId },
      data: { is_active: true },
    });
    if (activated.count !== 1) throw new Error("The sample receiving Location changed while it was being activated.");
    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "Master Data",
      action: "ACTIVATE_DUMMY_RECEIVING_LOCATION",
      entityType: "MasterLocation",
      entityId: inactiveLocation.id,
      details: { entity_id: entityId, location_name: locationName },
    }, transaction);
    return inactiveLocation;
  }

  const location = await transaction.masterLocation.create({
    data: {
      organization_id: organizationId,
      entity_id: entityId,
      location_name: locationName,
      is_active: true,
    },
    select: { id: true },
  });
  await createAuditEvent({
    organizationId,
    userId: actorId,
    module: "Master Data",
    action: "CREATE_DUMMY_RECEIVING_LOCATION",
    entityType: "MasterLocation",
    entityId: location.id,
    details: { entity_id: entityId, location_name: locationName },
  }, transaction);
  return location;
}
