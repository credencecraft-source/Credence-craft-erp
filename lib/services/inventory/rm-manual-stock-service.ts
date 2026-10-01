import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

export class ManualStockError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "ManualStockError";
  }
}

type AddRawMaterialStockInput = {
  organizationId: string;
  userId: string;
  rawMaterialId: string;
  locationId: string;
  quantity: string;
  reason: string;
};

export async function addRawMaterialStockManually(input: AddRawMaterialStockInput) {
  if (!input.rawMaterialId || !input.locationId) {
    throw new ManualStockError("Select a raw material and active location.");
  }
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(input.quantity)) {
    throw new ManualStockError("Quantity must be a positive number with up to two decimal places.");
  }
  const quantity = new Prisma.Decimal(input.quantity);
  if (!quantity.isFinite() || !quantity.greaterThan(0)) {
    throw new ManualStockError("Quantity must be greater than zero.");
  }
  if (!input.reason || input.reason.length > 500) {
    throw new ManualStockError("Enter a reason of no more than 500 characters.");
  }

  return prisma.$transaction(async (transaction) => {
    const rawMaterial = await transaction.masterRawMaterial.findFirst({
      where: { id: input.rawMaterialId, organization_id: input.organizationId, is_active: true },
      select: { id: true, raw_material_name: true },
    });
    if (!rawMaterial) throw new ManualStockError("The selected raw material is not active in this organization.", 404);

    const location = await transaction.masterLocation.findFirst({
      where: { id: input.locationId, organization_id: input.organizationId, is_active: true, entity: { is_active: true } },
      select: { id: true, entity_id: true, location_name: true },
    });
    if (!location) throw new ManualStockError("The selected location is not active in this organization.", 404);

    const stock = await transaction.rawMaterialStock.create({
      data: {
        organization_id: input.organizationId,
        entity_id: location.entity_id,
        location_id: location.id,
        raw_material: rawMaterial.raw_material_name,
        quantity_on_hand: quantity,
        source_type: "MANUAL",
      },
      include: { location: { select: { location_name: true } } },
    });

    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      module: "Inventory Management",
      action: "MANUAL_ADD",
      entityType: "RawMaterialStock",
      entityId: stock.id,
      details: {
        raw_material: rawMaterial.raw_material_name,
        location_id: location.id,
        quantity_added: quantity.toString(),
        reason: input.reason,
      },
    }, transaction);

    return stock;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}