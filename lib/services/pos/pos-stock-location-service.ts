import { Prisma } from "@prisma/client";

type PosStockLocationDatabase = Pick<Prisma.TransactionClient, "storageNode" | "masterLocation">;

export type PosStockHierarchy = {
  entityId: string;
  divisionId: string;
  locationId: string;
  subLocationId: string;
  subSubLocationId: string;
};

export class PosStockLocationError extends Error {
  constructor(message = "Select an active Sub-sub-location under the selected hierarchy.") {
    super(message);
    this.name = "PosStockLocationError";
  }
}

export async function resolveActivePosStockLocation(
  database: PosStockLocationDatabase,
  organizationId: string,
  hierarchy: PosStockHierarchy,
) {
  const resolved = await resolveActivePosStockLocationByLeaf(
    database,
    organizationId,
    hierarchy.subSubLocationId,
    hierarchy.entityId,
    hierarchy.locationId,
  );
  if (resolved.divisionId !== hierarchy.divisionId || resolved.subLocationId !== hierarchy.subLocationId) {
    throw new PosStockLocationError();
  }
  return resolved;
}

export async function resolveActivePosStockLocationByLeaf(
  database: PosStockLocationDatabase,
  organizationId: string,
  subSubLocationId: string,
  expectedEntityId?: string,
  expectedLocationId?: string,
) {
  const leaf = await database.storageNode.findFirst({
    where: {
      id: subSubLocationId,
      organization_id: organizationId,
      node_type: "SUB_STORE",
      is_active: true,
    },
    select: { id: true, parent_node_id: true, parent_node_type: true },
  });
  if (!leaf || !leaf.parent_node_id || leaf.parent_node_type !== "WAREHOUSE") {
    throw new PosStockLocationError();
  }

  const subLocation = await database.storageNode.findFirst({
    where: {
      id: leaf.parent_node_id,
      organization_id: organizationId,
      node_type: "WAREHOUSE",
      is_active: true,
    },
    select: { id: true, parent_node_id: true, parent_node_type: true },
  });
  if (!subLocation || !subLocation.parent_node_id || subLocation.parent_node_type !== "LOCATION_SITE") {
    throw new PosStockLocationError();
  }

  const site = await database.storageNode.findFirst({
    where: {
      id: subLocation.parent_node_id,
      organization_id: organizationId,
      ...(expectedEntityId ? { entity_id: expectedEntityId } : {}),
      node_type: "LOCATION_SITE",
      is_active: true,
    },
    select: {
      id: true,
      entity_id: true,
      master_location_id: true,
      parent_node_id: true,
      parent_node_type: true,
    },
  });
  if (!site?.entity_id || !site.master_location_id
    || site.parent_node_id !== null || site.parent_node_type !== null
    || (expectedLocationId && site.master_location_id !== expectedLocationId)) {
    throw new PosStockLocationError();
  }

  const location = await database.masterLocation.findFirst({
    where: {
      id: site.master_location_id,
      organization_id: organizationId,
      entity_id: site.entity_id,
      is_active: true,
      entity: { is: { is_active: true } },
      division: { is: { is_active: true, entity_id: site.entity_id } },
    },
    select: { id: true, entity_id: true, division_id: true },
  });
  if (!location) throw new PosStockLocationError();

  return {
    entityId: location.entity_id,
    divisionId: location.division_id,
    locationId: location.id,
    subLocationId: subLocation.id,
    subSubLocationId: leaf.id,
  };
}
