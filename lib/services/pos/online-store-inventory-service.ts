import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import type { OrganizationContext } from "@/lib/services/organizations/organization-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { GENERAL_FINISHED_GOODS_SKU_SOURCES } from "@/lib/services/inventory/finished-goods-stock-overview";
import { listStorageNodesForOrganization } from "@/lib/services/inventory/storage-node-service";

const ONLINE_STORE_LOCATION_IDS_KEY = "onlineStoreLocationIds";
const MAX_ONLINE_STORE_LOCATIONS = 500;

export class OnlineStoreInventoryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "OnlineStoreInventoryError";
  }
}

export type OnlineStoreInventoryLocation = {
  id: string;
  segment: string;
  entityId: string;
  entityName: string;
  locationName: string;
  active: boolean;
  onlineEnabled: boolean;
  stockItemCount: number;
  availableQuantity: string;
  subLocations: OnlineStoreInventorySubLocation[];
};

export type OnlineStoreInventorySubLocation = {
  id: string;
  segment: string;
  name: string;
  code: string;
  active: boolean;
  stockItemCount: number;
  availableQuantity: string;
  subSubLocations: OnlineStoreInventorySubSubLocation[];
};

export type OnlineStoreInventorySubSubLocation = {
  id: string;
  segment: string;
  name: string;
  code: string;
  active: boolean;
  stockItemCount: number;
  availableQuantity: string;
};

export type OnlineStoreStockItem = {
  id: string;
  styleName: string;
  articleNo: string;
  brand: string | null;
  colour: string | null;
  size: string | null;
  currentStock: string;
  salesPrice: string | null;
  mrp: string | null;
};

export type OnlineStoreInventoryView =
  | { level: "LOCATIONS"; locations: OnlineStoreInventoryLocation[]; canonicalPath: string[] }
  | { level: "SUB_LOCATIONS"; location: OnlineStoreInventoryLocation; canonicalPath: string[] }
  | {
      level: "SUB_SUB_LOCATIONS";
      location: OnlineStoreInventoryLocation;
      subLocation: OnlineStoreInventorySubLocation;
      canonicalPath: string[];
    }
  | {
      level: "STOCK";
      location: OnlineStoreInventoryLocation;
      subLocation: OnlineStoreInventorySubLocation;
      subSubLocation: OnlineStoreInventorySubSubLocation;
      stockItems: OnlineStoreStockItem[];
      totalStockItemCount: number;
      canonicalPath: string[];
    };

type OnlineStoreInventoryTreeNode = {
  id: string;
  value_id: string;
  label: string;
  code: string | null;
  parent_id: string | null;
  is_active: boolean;
  fields: Record<string, string | null>;
};

export type EnabledOnlineStoreLocation = {
  id: string;
  entityId: string;
  name: string;
  entityName: string;
};

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlineLocationIds(settings: Prisma.JsonValue | null) {
  if (settings === null) return [];
  if (!isJsonObject(settings)) {
    throw new OnlineStoreInventoryError("Online-store module settings are invalid.", 500);
  }
  const savedIds = settings[ONLINE_STORE_LOCATION_IDS_KEY];
  if (savedIds === undefined) return [];
  if (!Array.isArray(savedIds) || savedIds.some((id) => typeof id !== "string")) {
    throw new OnlineStoreInventoryError("Online-store location settings are invalid.", 500);
  }
  return [...new Set(savedIds)];
}

function readableSegment(name: string, id: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "location"}--${encodeURIComponent(id)}`;
}

async function findPosModuleSettings(
  database: Pick<Prisma.TransactionClient, "eRPModule">,
  organizationId: string,
) {
  const moduleRecord = await database.eRPModule.findFirst({
    where: {
      module_key: "pos",
      software: { is: { organization_id: organizationId } },
    },
    select: { id: true, settings: true },
  });
  if (!moduleRecord) throw new OnlineStoreInventoryError("The organization POS module is unavailable.", 409);
  return moduleRecord;
}

export async function listOrganizationOnlineStoreInventory(organizationId: string) {
  const moduleRecord = await findPosModuleSettings(prisma, organizationId);
  const enabledLocationIds = new Set(onlineLocationIds(moduleRecord.settings));
  const [locations, stockTotals, nodeStockTotals, storageNodes] = await Promise.all([
    prisma.masterLocation.findMany({
      where: { organization_id: organizationId },
      select: {
        id: true,
        entity_id: true,
        location_name: true,
        is_active: true,
        entity: { select: { entity_name: true, is_active: true } },
        division: { select: { is_active: true } },
      },
      orderBy: [{ sort_order: "asc" }, { location_name: "asc" }, { id: "asc" }],
      take: MAX_ONLINE_STORE_LOCATIONS + 1,
    }),
    prisma.finishedGoodsSkuStock.groupBy({
      by: ["location_id"],
      where: {
        organization_id: organizationId,
        entity_id: { not: null },
        location_id: { not: null },
        source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
        current_stock: { gt: 0 },
        OR: [{ sales_price: { gt: 0 } }, { mrp: { gt: 0 } }],
      },
      _sum: { current_stock: true },
      _count: { _all: true },
    }),
    prisma.finishedGoodsSkuStock.groupBy({
      by: ["storage_node_id", "location_id", "entity_id"],
      where: {
        organization_id: organizationId,
        storage_node_id: { not: null },
        location_id: { not: null },
        entity_id: { not: null },
        source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
        current_stock: { gt: 0 },
        OR: [{ sales_price: { gt: 0 } }, { mrp: { gt: 0 } }],
      },
      _sum: { current_stock: true },
      _count: { _all: true },
    }),
    listStorageNodesForOrganization(organizationId, {
      includeInactive: true,
      limit: MAX_ONLINE_STORE_LOCATIONS,
    }),
  ]);
  if (locations.length > MAX_ONLINE_STORE_LOCATIONS) {
    throw new OnlineStoreInventoryError(
      `This organization has more than ${MAX_ONLINE_STORE_LOCATIONS} locations. Narrow the location list before managing online availability.`,
      413,
    );
  }
  const totalsByLocationId = new Map(
    stockTotals.flatMap((total) => total.location_id
      ? [[total.location_id, {
          stockItemCount: total._count._all,
          availableQuantity: total._sum.current_stock?.toString() ?? "0",
        }] as const]
      : []),
  );
  const totalsByNodeId = new Map(
    nodeStockTotals.flatMap((total) => total.storage_node_id
      && total.location_id
      && total.entity_id
      ? [[`${total.location_id}:${total.entity_id}:${total.storage_node_id}`, {
          stockItemCount: total._count._all,
          availableQuantity: total._sum.current_stock?.toString() ?? "0",
        }] as const]
      : []),
  );
  const nodes = storageNodes as OnlineStoreInventoryTreeNode[];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nodeType = (node: OnlineStoreInventoryTreeNode) => node.fields.node_type;
  const nodeName = (node: OnlineStoreInventoryTreeNode) => node.fields.node_name ?? node.label;
  const nodeCode = (node: OnlineStoreInventoryTreeNode) => node.fields.node_code ?? node.code ?? "";
  const nodeParentId = (node: OnlineStoreInventoryTreeNode) =>
    node.fields.parent_node_id ?? node.parent_id;
  const activeNodeChain = (nodeId: string, entityId: string) => {
    let node = nodesById.get(nodeId);
    for (let depth = 0; node && depth < 5; depth += 1) {
      if (!node.is_active || node.fields.site_entity_id !== entityId) return false;
      if (nodeType(node) === "LOCATION_SITE") return true;
      const parentId = nodeParentId(node);
      if (!parentId) return false;
      node = nodesById.get(parentId);
    }
    return false;
  };
  const sumNodeStats = (locationId: string, entityId: string, nodeIds: string[]) => {
    const stats = nodeIds
      .map((id) => totalsByNodeId.get(`${locationId}:${entityId}:${id}`))
      .filter((item) => item !== undefined);
    return {
      stockItemCount: stats.reduce((total, item) => total + item.stockItemCount, 0),
      availableQuantity: stats.reduce(
        (total, item) => total.plus(item.availableQuantity),
        new Prisma.Decimal(0),
      ).toString(),
    };
  };

  return locations.map((location): OnlineStoreInventoryLocation => {
    const stock = totalsByLocationId.get(location.id);
    const site = nodes.find((node) =>
      nodeType(node)
      === "LOCATION_SITE"
      && node.fields.master_location_id === location.id
      && node.fields.entity_id === location.entity_id,
    );
    const subLocations = site
      ? nodes.filter((node) =>
          nodeType(node) === "WAREHOUSE" && nodeParentId(node) === site.id,
        )
      : [];
    const children: OnlineStoreInventorySubLocation[] = subLocations.map((subLocation) => {
      const leaves = nodes.filter((node) =>
        nodeType(node) === "SUB_STORE" && nodeParentId(node) === subLocation.id,
      );
      const subSubLocations: OnlineStoreInventorySubSubLocation[] = leaves.map((leaf) => {
        const stats = totalsByNodeId.get(`${location.id}:${location.entity_id}:${leaf.id}`);
        return {
          id: leaf.id,
          segment: readableSegment(nodeName(leaf), leaf.id),
          name: nodeName(leaf),
          code: nodeCode(leaf),
          active: location.is_active
            && location.entity.is_active
            && location.division.is_active
            && activeNodeChain(leaf.id, location.entity_id),
          stockItemCount: stats?.stockItemCount ?? 0,
          availableQuantity: stats?.availableQuantity ?? "0",
        };
      });
      const stats = sumNodeStats(location.id, location.entity_id, leaves.map((leaf) => leaf.id));
      return {
        id: subLocation.id,
        segment: readableSegment(nodeName(subLocation), subLocation.id),
        name: nodeName(subLocation),
        code: nodeCode(subLocation),
        active: location.is_active
          && location.entity.is_active
          && location.division.is_active
          && activeNodeChain(subLocation.id, location.entity_id),
        ...stats,
        subSubLocations,
      };
    });
    return {
      id: location.id,
      segment: readableSegment(location.location_name, location.id),
      entityId: location.entity_id,
      entityName: location.entity.entity_name,
      locationName: location.location_name,
      active: location.is_active
        && location.entity.is_active
        && location.division.is_active
        && Boolean(site?.is_active),
      onlineEnabled: enabledLocationIds.has(location.id),
      stockItemCount: stock?.stockItemCount ?? 0,
      availableQuantity: stock?.availableQuantity ?? "0",
      subLocations: children,
    };
  });
}

export async function listEnabledOnlineStoreLocations(organizationId: string): Promise<EnabledOnlineStoreLocation[]> {
  const locations = await listOrganizationOnlineStoreInventory(organizationId);
  return locations.filter((location) => location.onlineEnabled && location.active).map((location) => ({
    id: location.id,
    entityId: location.entityId,
    name: location.locationName,
    entityName: location.entityName,
  }));
}

export async function setOnlineStoreLocationEnabled(input: {
  organization: OrganizationContext;
  actorId: string;
  locationId: unknown;
  enabled: unknown;
}) {
  if (typeof input.locationId !== "string" || !input.locationId.trim() || input.locationId.length > 100) {
    throw new OnlineStoreInventoryError("Select a valid inventory location.");
  }
  if (typeof input.enabled !== "boolean") {
    throw new OnlineStoreInventoryError("Select whether this location is available in the online store.");
  }
  const locationId = input.locationId.trim();

  await prisma.$transaction(async (transaction) => {
    const location = await transaction.masterLocation.findFirst({
      where: {
        id: locationId,
        organization_id: input.organization.id,
      },
      select: {
        id: true,
        entity_id: true,
        location_name: true,
        is_active: true,
        entity: { select: { is_active: true } },
        division: { select: { is_active: true } },
      },
    });
    if (!location) throw new OnlineStoreInventoryError("The inventory location was not found.", 404);
    if (input.enabled && (!location.is_active || !location.entity.is_active || !location.division.is_active)) {
      throw new OnlineStoreInventoryError("Activate the inventory location, Division, and Entity before publishing it.");
    }
    if (input.enabled) {
      const activeSite = await transaction.storageNode.findFirst({
        where: {
          organization_id: input.organization.id,
          entity_id: location.entity_id,
          master_location_id: location.id,
          node_type: "LOCATION_SITE",
          is_active: true,
        },
        select: { id: true },
      });
      if (!activeSite) {
        throw new OnlineStoreInventoryError("Create or activate the Location/Site storage node before publishing it.");
      }
    }

    const moduleRecord = await findPosModuleSettings(transaction, input.organization.id);
    const enabledIds = new Set(onlineLocationIds(moduleRecord.settings));
    if (input.enabled) enabledIds.add(location.id);
    else enabledIds.delete(location.id);

    const nextIds = [...enabledIds].slice(0, MAX_ONLINE_STORE_LOCATIONS);
    if (enabledIds.size > MAX_ONLINE_STORE_LOCATIONS) {
      throw new OnlineStoreInventoryError(
        `No more than ${MAX_ONLINE_STORE_LOCATIONS} locations can be published.`,
        413,
      );
    }
    const settings = isJsonObject(moduleRecord.settings) ? moduleRecord.settings : {};
    await transaction.eRPModule.update({
      where: { id: moduleRecord.id },
      data: {
        settings: {
          ...settings,
          [ONLINE_STORE_LOCATION_IDS_KEY]: nextIds,
        },
      },
    });
    await createAuditEvent({
      organizationId: input.organization.id,
      userId: input.actorId,
      module: "ONLINE_STORE",
      action: input.enabled ? "ENABLE_ONLINE_STORE_LOCATION" : "DISABLE_ONLINE_STORE_LOCATION",
      entityType: "master_location",
      entityId: location.id,
      details: { locationName: location.location_name, enabled: input.enabled },
    }, transaction);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function findEnabledOnlineStoreLocation(
  organizationId: string,
  locationId: string,
  database: Pick<Prisma.TransactionClient, "eRPModule" | "masterLocation" | "storageNode"> = prisma,
) {
  if (!onlineLocationIds((await findPosModuleSettings(database, organizationId)).settings).includes(locationId)) {
    return null;
  }
  const location = await database.masterLocation.findFirst({
    where: {
      id: locationId,
      organization_id: organizationId,
      is_active: true,
      entity: { is: { is_active: true } },
      division: { is: { is_active: true } },
    },
    select: {
      id: true,
      entity_id: true,
      location_name: true,
    },
  });
  if (!location) return null;
  const activeSite = await database.storageNode.findFirst({
    where: {
      organization_id: organizationId,
      entity_id: location.entity_id,
      master_location_id: location.id,
      node_type: "LOCATION_SITE",
      is_active: true,
    },
    select: { id: true },
  });
  return activeSite
    ? { id: location.id, entityId: location.entity_id, name: location.location_name }
    : null;
}

export async function resolveOnlineStoreInventoryPath(
  organizationId: string,
  pathSegments: string[],
): Promise<OnlineStoreInventoryView | null> {
  if (pathSegments.length < 1 || pathSegments.length > 3) return null;
  const locations = await listOrganizationOnlineStoreInventory(organizationId);
  const location = locations.find((item) => item.segment === pathSegments[0]);
  if (!location) return null;
  const locationPath = [location.segment];
  if (pathSegments.length === 1) {
    return { level: "SUB_LOCATIONS", location, canonicalPath: locationPath };
  }

  const subLocation = location.subLocations.find((item) => item.segment === pathSegments[1]);
  if (!subLocation) return null;
  const subLocationPath = [...locationPath, subLocation.segment];
  if (pathSegments.length === 2) {
    return {
      level: "SUB_SUB_LOCATIONS",
      location,
      subLocation,
      canonicalPath: subLocationPath,
    };
  }

  const subSubLocation = subLocation.subSubLocations.find((item) => item.segment === pathSegments[2]);
  if (!subSubLocation) return null;
  const stockRecords = await prisma.finishedGoodsSkuStock.findMany({
    where: {
      organization_id: organizationId,
      entity_id: location.entityId,
      location_id: location.id,
      storage_node_id: subSubLocation.id,
      source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
      current_stock: { gt: 0 },
      OR: [{ sales_price: { gt: 0 } }, { mrp: { gt: 0 } }],
    },
    select: {
      id: true,
      style_name: true,
      article_no: true,
      brand: true,
      colour: true,
      size: true,
      current_stock: true,
      sales_price: true,
      mrp: true,
    },
    orderBy: [{ style_name: "asc" }, { article_no: "asc" }, { size: "asc" }, { id: "asc" }],
    take: 500,
  });
  const stockItems: OnlineStoreStockItem[] = stockRecords.map((record) => ({
    id: record.id,
    styleName: record.style_name,
    articleNo: record.article_no,
    brand: record.brand,
    colour: record.colour,
    size: record.size,
    currentStock: record.current_stock.toString(),
    salesPrice: record.sales_price?.toString() ?? null,
    mrp: record.mrp?.toString() ?? null,
  }));
  return {
    level: "STOCK",
    location,
    subLocation,
    subSubLocation,
    stockItems,
    totalStockItemCount: subSubLocation.stockItemCount,
    canonicalPath: [...subLocationPath, subSubLocation.segment],
  };
}
