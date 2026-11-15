import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

const SAMPLE_GATE_ENTRY_COUNT = 5;

export async function createDummySampleGateEntries(
  organizationId: string,
  batchId: string,
  purchaseOrderIds: string[],
  actorId: string,
) {
  if (purchaseOrderIds.length < 10) {
    throw new Error("At least ten approved sample Purchase Orders are required before RM Gate Entry.");
  }

  const selectedPurchaseOrderIds = purchaseOrderIds.slice(0, SAMPLE_GATE_ENTRY_COUNT);
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      organization_id: organizationId,
      id: { in: selectedPurchaseOrderIds },
      status: { in: ["APPROVED", "SHARED"] },
    },
    select: {
      id: true,
      purchase_order_no: true,
      display_no: true,
      vendor: { select: { vendor: true } },
      lines: { select: { raw_material: true, quantity: true } },
    },
  });
  const purchaseOrderById = new Map(purchaseOrders.map((order) => [order.id, order]));
  if (selectedPurchaseOrderIds.some((id) => !purchaseOrderById.has(id))) {
    throw new Error("Each sample RM Gate Entry requires its own approved Purchase Order.");
  }

  const notes = `Dummy sample batch ${batchId}; Step 6 RM Gate Entry`;
  const entries: Array<{ id: string; purchaseOrderId: string }> = [];

  for (const [index, purchaseOrderId] of selectedPurchaseOrderIds.entries()) {
    const purchaseOrder = purchaseOrderById.get(purchaseOrderId);
    if (!purchaseOrder) throw new Error("A selected sample Purchase Order could not be loaded.");

    const existing = await prisma.gateEntry.findFirst({
      where: { organization_id: organizationId, purchase_order_id: purchaseOrder.id, notes },
      select: { id: true, direction: true, movement_type: true },
    });
    if (existing) {
      if (existing.direction !== "INWARD" || existing.movement_type !== "CHALLAN") {
        throw new Error("An existing sample Gate Entry does not match the RM inbound workflow.");
      }
      entries.push({ id: existing.id, purchaseOrderId });
      continue;
    }

    const totalQuantity = purchaseOrder.lines.reduce(
      (total, line) => total.plus(line.quantity),
      new Prisma.Decimal(0),
    );
    if (!totalQuantity.greaterThan(0)) {
      throw new Error(`Sample Purchase Order ${purchaseOrder.purchase_order_no} has no positive line quantity.`);
    }
    const entryQuantity = index % 2 === 0 ? totalQuantity.div(2) : totalQuantity;
    const purchaseOrderNo = purchaseOrder.display_no
      ? `PO-${purchaseOrder.display_no}`
      : purchaseOrder.purchase_order_no;

    const entry = await prisma.$transaction(async (transaction) => {
      const created = await transaction.gateEntry.create({
        data: {
          organization_id: organizationId,
          purchase_order_id: purchaseOrder.id,
          entry_no: await reserveChallanNumber(organizationId, "GATE_ENTRY", transaction),
          direction: "INWARD",
          movement_type: "CHALLAN",
          challan_no: purchaseOrderNo,
          person_name: purchaseOrder.vendor.vendor,
          company_name: purchaseOrder.vendor.vendor,
          purpose: "Sample raw-material inward",
          item_description: purchaseOrder.lines
            .map((line) => line.raw_material || "Raw material")
            .join(", ")
            .slice(0, 1000),
          quantity: entryQuantity,
          entry_at: new Date(),
          notes,
          created_by: actorId,
        },
        select: { id: true },
      });
      await createAuditEvent({
        organizationId,
        userId: actorId,
        module: "Inventory Management",
        action: "CREATE_DUMMY_RM_GATE_ENTRY",
        entityType: "GateEntry",
        entityId: created.id,
        details: {
          batch_id: batchId,
          purchase_order_id: purchaseOrder.id,
          purchase_order_no: purchaseOrderNo,
          quantity: entryQuantity.toString(),
          partial: entryQuantity.lessThan(totalQuantity),
        },
      }, transaction);
      return created;
    }, { maxWait: 10_000, timeout: 30_000 });
    entries.push({ id: entry.id, purchaseOrderId });
  }

  if (
    entries.length !== SAMPLE_GATE_ENTRY_COUNT
    || new Set(entries.map((entry) => entry.purchaseOrderId)).size !== SAMPLE_GATE_ENTRY_COUNT
  ) {
    throw new Error("Five sample RM Gate Entries linked to five different Purchase Orders are required.");
  }

  return entries;
}
