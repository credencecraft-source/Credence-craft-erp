import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { getActiveBinPlacement, StorageNodeError } from "@/lib/services/inventory/storage-node-service";

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
  storageNodeId: string;
  quantity: string;
  reason: string;
  isAssetStock?: boolean;
};

export async function addRawMaterialStockManually(input: AddRawMaterialStockInput) {
  if (!input.rawMaterialId || !input.locationId || !input.storageNodeId) {
    throw new ManualStockError("Select a raw material, active location, and storage Bin.");
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
      select: { id: true, raw_material_name: true, is_asset: true },
    });
    if (!rawMaterial) throw new ManualStockError("The selected raw material is not active in this organization.", 404);
    if (rawMaterial.is_asset !== (input.isAssetStock ?? false)) {
      throw new ManualStockError(input.isAssetStock
        ? "Select an asset-classified raw material for Assets Stock."
        : "Asset-classified materials can only be added through Assets Stock.");
    }

    const location = await transaction.masterLocation.findFirst({
      where: { id: input.locationId, organization_id: input.organizationId, is_active: true, entity: { is_active: true } },
      select: { id: true, entity_id: true, location_name: true },
    });
    if (!location) throw new ManualStockError("The selected location is not active in this organization.", 404);
    let storageBin: Awaited<ReturnType<typeof getActiveBinPlacement>>;
    try {
      storageBin = await getActiveBinPlacement(
        transaction,
        input.organizationId,
        input.storageNodeId,
        location.entity_id,
      );
    } catch (error) {
      if (error instanceof StorageNodeError) throw new ManualStockError(error.message, error.status);
      throw error;
    }

    const stock = await transaction.rawMaterialStock.create({
      data: {
        organization_id: input.organizationId,
        entity_id: location.entity_id,
        location_id: location.id,
        storage_node_id: storageBin.id,
        raw_material: rawMaterial.raw_material_name,
        quantity_on_hand: quantity,
        source_type: "MANUAL",
      },
      include: {
        location: { select: { location_name: true } },
        storageNode: { select: { node_name: true, node_code: true, node_type: true } },
      },
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
        storage_node_id: storageBin.id,
        quantity_added: quantity.toString(),
        reason: input.reason,
      },
    }, transaction);

    return stock;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}