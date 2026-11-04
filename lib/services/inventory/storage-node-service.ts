import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export const STORAGE_NODE_TYPES = [
  "LOCATION_SITE",
  "WAREHOUSE",
  "SUB_STORE",
  "RACK",
  "BIN",
] as const;

export type StorageNodeType = (typeof STORAGE_NODE_TYPES)[number];

const parentTypeByNodeType: Record<StorageNodeType, StorageNodeType | null> = {
  LOCATION_SITE: null,
  WAREHOUSE: "LOCATION_SITE",
  SUB_STORE: "WAREHOUSE",
  RACK: "SUB_STORE",
  BIN: "RACK",
};

export class StorageNodeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "StorageNodeError";
  }
}

type StorageNodeInput = {
  nodeType: unknown;
  code: unknown;
  name: unknown;
  parentId?: unknown;
  entityId?: unknown;
};

type StorageNodeRecord = {
  id: string;
  value_id: string;
  organization_id: string;
  node_type: StorageNodeType;
  node_code: string;
  node_name: string;
  parent_node_id: string | null;
  parent_node_type: StorageNodeType | null;
  entity_id: string | null;
  is_active: boolean;
  sort_order: number;
};

function isStorageNodeType(value: unknown): value is StorageNodeType {
  return typeof value === "string" && STORAGE_NODE_TYPES.includes(value as StorageNodeType);
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new StorageNodeError(`${label} is required.`);
  const text = normalizeUppercase(value.trim());
  if (!text) throw new StorageNodeError(`${label} is required.`);
  if (text.length > maxLength) throw new StorageNodeError(`${label} must be ${maxLength} characters or fewer.`);
  return text;
}

async function findActiveNodeChain(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  nodeId: string,
  expectedType?: StorageNodeType,
) {
  const chain: StorageNodeRecord[] = [];
  let nextId: string | null = nodeId;
  let expectedNodeType = expectedType;

  while (nextId) {
    if (chain.length >= STORAGE_NODE_TYPES.length) {
      throw new StorageNodeError("The storage hierarchy is invalid.", 409);
    }
    const node: StorageNodeRecord | null = await transaction.storageNode.findFirst({
      where: { id: nextId, organization_id: organizationId },
      select: {
        id: true,
        value_id: true,
        organization_id: true,
        node_type: true,
        node_code: true,
        node_name: true,
        parent_node_id: true,
        parent_node_type: true,
        entity_id: true,
        is_active: true,
        sort_order: true,
      },
    });
    if (!node || !node.is_active) {
      throw new StorageNodeError("Select an active storage node belonging to this organization.", 404);
    }
    if (expectedNodeType && node.node_type !== expectedNodeType) {
      throw new StorageNodeError(`A ${expectedNodeType.replaceAll("_", " ").toLowerCase()} is required.`);
    }
    if (node.parent_node_type !== parentTypeByNodeType[node.node_type]) {
      throw new StorageNodeError("The storage hierarchy has an invalid parent relationship.", 409);
    }
    chain.push(node);
    expectedNodeType = parentTypeByNodeType[node.node_type] ?? undefined;
    nextId = node.parent_node_id;
  }

  if (chain.length !== STORAGE_NODE_TYPES.indexOf(chain[0].node_type) + 1) {
    throw new StorageNodeError("The storage hierarchy is incomplete.", 409);
  }
  return chain;
}

function nodePath(chain: StorageNodeRecord[]) {
  return [...chain].reverse().map((node) => node.node_name).join(" / ");
}

export async function listStorageNodesForOrganization(
  organizationId: string,
  options: {
    includeInactive?: boolean;
    nodeType?: StorageNodeType;
    siteEntityId?: string;
    search?: string;
    exactSearch?: boolean;
    limit?: number;
    cursor?: string;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const rows: StorageNodeRecord[] = await prisma.storageNode.findMany({
    where: {
      organization_id: organizationId,
      ...(options.includeInactive ? {} : { is_active: true }),
      ...(options.nodeType ? { node_type: options.nodeType } : {}),
      ...(options.siteEntityId ? {
        parent: {
          is: {
            node_type: "RACK",
            is_active: true,
            parent: {
              is: {
                node_type: "SUB_STORE",
                is_active: true,
                parent: {
                  is: {
                    node_type: "WAREHOUSE",
                    is_active: true,
                    parent: {
                      is: {
                        node_type: "LOCATION_SITE",
                        entity_id: options.siteEntityId,
                        is_active: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      } : {}),
      ...(options.search?.trim() ? {
        OR: [
          ...(options.exactSearch ? [
            { node_code: { equals: options.search.trim(), mode: "insensitive" as const } },
            { node_name: { equals: options.search.trim(), mode: "insensitive" as const } },
            { id: options.search.trim() },
            { value_id: options.search.trim() },
          ] : [
            { node_code: { contains: options.search.trim(), mode: "insensitive" as const } },
            { node_name: { contains: options.search.trim(), mode: "insensitive" as const } },
          ]),
        ],
      } : {}),
    },
    orderBy: [{ node_type: "asc" }, { sort_order: "asc" }, { node_code: "asc" }, { id: "asc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: limit,
    select: {
      id: true,
      value_id: true,
      organization_id: true,
      node_type: true,
      node_code: true,
      node_name: true,
      parent_node_id: true,
      parent_node_type: true,
      entity_id: true,
      is_active: true,
      sort_order: true,
    },
  });

  const nodesById = new Map(rows.map((node) => [node.id, node]));
  let parentIds = [...new Set(rows.flatMap((node) => node.parent_node_id ? [node.parent_node_id] : []))];
  for (let depth = 0; depth < STORAGE_NODE_TYPES.length && parentIds.length > 0; depth += 1) {
    const parents: StorageNodeRecord[] = await prisma.storageNode.findMany({
      where: { organization_id: organizationId, id: { in: parentIds } },
      select: {
        id: true,
        value_id: true,
        organization_id: true,
        node_type: true,
        node_code: true,
        node_name: true,
        parent_node_id: true,
        parent_node_type: true,
        entity_id: true,
        is_active: true,
        sort_order: true,
      },
    });
    for (const parent of parents) nodesById.set(parent.id, parent);
    parentIds = [...new Set(parents.flatMap((node) => node.parent_node_id ? [node.parent_node_id] : []))]
      .filter((id) => !nodesById.has(id));
  }

  const nodes = rows
    .filter((node) => options.includeInactive || (() => {
      let ancestorId = node.parent_node_id;
      while (ancestorId) {
        const ancestor = nodesById.get(ancestorId);
        if (!ancestor?.is_active) return false;
        ancestorId = ancestor.parent_node_id;
      }
      return true;
    })())
    .map((node) => {
    const chain: StorageNodeRecord[] = [node];
    let ancestorId = node.parent_node_id;
    while (ancestorId && chain.length < STORAGE_NODE_TYPES.length) {
      const ancestor = nodesById.get(ancestorId);
      if (!ancestor) break;
      chain.push(ancestor);
      ancestorId = ancestor.parent_node_id;
    }
    const site = chain.find((ancestor) => ancestor.node_type === "LOCATION_SITE");
    const fields: Record<string, string | null> = {
      node_type: node.node_type,
      node_code: node.node_code,
      node_name: node.node_name,
      entity_id: node.entity_id,
      parent_node_id: node.parent_node_id,
      parent_node_type: node.parent_node_type,
      path: nodePath(chain),
      site_entity_id: site?.entity_id ?? null,
    };
    return {
      id: node.id,
      value_id: node.value_id,
      label: node.node_name,
      code: node.node_code ?? null,
      description: null,
      is_active: node.is_active,
      is_dummy: false,
      parent_id: node.parent_node_id,
      fields,
    };
  });
  return nodes;
}

export async function getStorageNodePathsForOrganization(organizationId: string, nodeIds: string[]) {
  const requestedIds = [...new Set(nodeIds.filter(Boolean))];
  if (requestedIds.length === 0) return new Map<string, string>();

  const nodesById = new Map<string, StorageNodeRecord>();
  let pendingIds = requestedIds;
  for (let depth = 0; depth < STORAGE_NODE_TYPES.length && pendingIds.length > 0; depth += 1) {
    const nodes: StorageNodeRecord[] = await prisma.storageNode.findMany({
      where: { organization_id: organizationId, id: { in: pendingIds } },
      select: {
        id: true,
        value_id: true,
        organization_id: true,
        node_type: true,
        node_code: true,
        node_name: true,
        parent_node_id: true,
        parent_node_type: true,
        entity_id: true,
        is_active: true,
        sort_order: true,
      },
    });
    for (const node of nodes) nodesById.set(node.id, node);
    pendingIds = [...new Set(nodes.flatMap((node) => node.parent_node_id ? [node.parent_node_id] : []))]
      .filter((id) => !nodesById.has(id));
  }

  return new Map(requestedIds.flatMap((nodeId) => {
    const chain: StorageNodeRecord[] = [];
    let currentId: string | null = nodeId;
    while (currentId && chain.length < STORAGE_NODE_TYPES.length) {
      const current = nodesById.get(currentId);
      if (!current) break;
      chain.push(current);
      currentId = current.parent_node_id;
    }
    return chain.length > 0 ? [[nodeId, nodePath(chain)]] : [];
  }));
}

export async function createStorageNode(
  organizationId: string,
  userId: string,
  input: StorageNodeInput,
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  if (!userId) throw new StorageNodeError("An authorized actor is required to create a storage node.", 403);
  if (!isStorageNodeType(input.nodeType)) throw new StorageNodeError("Select a valid storage hierarchy level.");
  const nodeType = input.nodeType;
  const nodeCode = requiredText(input.code, "Code", 100);
  const nodeName = requiredText(input.name, "Name", 255);
  const parentId = typeof input.parentId === "string" ? input.parentId.trim() : "";
  const entityId = typeof input.entityId === "string" ? input.entityId.trim() : "";
  const expectedParentType = parentTypeByNodeType[nodeType];

  if (nodeType === "LOCATION_SITE") {
    if (parentId) throw new StorageNodeError("A Location/Site cannot have a parent.");
    if (!entityId) throw new StorageNodeError("Select the active legal Entity associated with this Location/Site.");
  } else {
    if (!parentId) throw new StorageNodeError(`Select an active ${expectedParentType?.replaceAll("_", " ").toLowerCase()}.`);
    if (entityId) throw new StorageNodeError("Legal Entity is assigned only to a Location/Site.");
  }

  const createWithinTransaction = async (transaction: Prisma.TransactionClient) => {
    if (nodeType === "LOCATION_SITE") {
      const entity = await transaction.masterEntity.findFirst({
        where: { id: entityId, organization_id: organizationId, is_active: true },
        select: { id: true },
      });
      if (!entity) throw new StorageNodeError("Select an active legal Entity belonging to this organization.", 404);
    } else {
      await findActiveNodeChain(transaction, organizationId, parentId, expectedParentType ?? undefined);
    }

    const created = await transaction.storageNode.create({
      data: {
        organization_id: organizationId,
        node_type: nodeType,
        node_code: nodeCode,
        node_name: nodeName,
        parent_node_id: parentId || null,
        parent_node_type: expectedParentType,
        entity_id: entityId || null,
        sort_order: await transaction.storageNode.count({
          where: { organization_id: organizationId, node_type: nodeType },
        }),
      },
    });
    await createAuditEvent({
      organizationId,
      userId,
      module: "master-data",
      action: "CREATE",
      entityType: "StorageNode",
      entityId: created.id,
      details: {
        node_type: created.node_type,
        node_code: created.node_code,
        node_name: created.node_name,
        parent_node_id: created.parent_node_id,
        entity_id: created.entity_id,
      },
    }, transaction);
    return created;
  };

  if ("$transaction" in database) {
    return database.$transaction(createWithinTransaction, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  return createWithinTransaction(database);
}

export async function updateStorageNode(
  organizationId: string,
  userId: string,
  valueId: string,
  input: {
    fields?: Record<string, unknown>;
    label?: string;
    isActive?: boolean;
  },
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  if (!userId) throw new StorageNodeError("An authorized actor is required to update a storage node.", 403);
  const updateWithinTransaction = async (transaction: Prisma.TransactionClient) => {
    const existing = await transaction.storageNode.findFirst({
      where: { organization_id: organizationId, OR: [{ id: valueId }, { value_id: valueId }] },
    });
    if (!existing) throw new StorageNodeError("Storage node not found in this organization.", 404);

    const fields = input.fields ?? {};
    if (fields.node_type !== undefined && fields.node_type !== existing.node_type) {
      throw new StorageNodeError("A storage node's hierarchy level cannot be changed.");
    }
    for (const [fieldKey, currentValue] of [
      ["parent_node_id", existing.parent_node_id],
      ["entity_id", existing.entity_id],
    ] as const) {
      const requested = fields[fieldKey];
      if (requested === undefined) continue;
      if (requested === null || requested === "") {
        if (currentValue !== null) throw new StorageNodeError("A storage node's parent and Entity cannot be changed.");
      } else if (requested !== currentValue) {
        const related = await transaction.storageNode.findFirst({
          where: {
            organization_id: organizationId,
            OR: [{ id: String(requested) }, { value_id: String(requested) }],
          },
          select: { id: true },
        });
        if (related?.id !== currentValue) throw new StorageNodeError("A storage node's parent and Entity cannot be changed.");
      }
    }

    const isActive = input.isActive ?? existing.is_active;
    if (!isActive && existing.is_active) {
      const activeChild = await transaction.storageNode.findFirst({
        where: { organization_id: organizationId, parent_node_id: existing.id, is_active: true },
        select: { id: true },
      });
      if (activeChild) throw new StorageNodeError("Deactivate active child nodes before deactivating this node.", 409);
    }
    if (isActive && !existing.is_active && existing.parent_node_id) {
      await findActiveNodeChain(
        transaction,
        organizationId,
        existing.parent_node_id,
        existing.parent_node_type ?? undefined,
      );
    }
    if (isActive && !existing.is_active && existing.node_type === "LOCATION_SITE" && existing.entity_id) {
      const entity = await transaction.masterEntity.findFirst({
        where: { id: existing.entity_id, organization_id: organizationId, is_active: true },
        select: { id: true },
      });
      if (!entity) throw new StorageNodeError("Activate the associated legal Entity before this Location/Site.", 409);
    }

    const nodeName = fields.node_name === undefined && input.label === undefined
      ? existing.node_name
      : requiredText(fields.node_name ?? input.label, "Name", 255);
    const nodeCode = fields.node_code === undefined
      ? existing.node_code
      : requiredText(fields.node_code, "Code", 100);
    const updated = await transaction.storageNode.update({
      where: { id: existing.id },
      data: { node_name: nodeName, node_code: nodeCode, is_active: isActive },
    });
    await createAuditEvent({
      organizationId,
      userId,
      module: "master-data",
      action: isActive === existing.is_active ? "UPDATE" : isActive ? "ACTIVATE" : "DEACTIVATE",
      entityType: "StorageNode",
      entityId: updated.id,
      details: {
        before: { node_code: existing.node_code, node_name: existing.node_name, is_active: existing.is_active },
        after: { node_code: updated.node_code, node_name: updated.node_name, is_active: updated.is_active },
      },
    }, transaction);
    return updated;
  };

  if ("$transaction" in database) {
    return database.$transaction(updateWithinTransaction, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  return updateWithinTransaction(database);
}

export async function deactivateStorageNode(
  organizationId: string,
  userId: string | undefined,
  valueId: string,
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  if (!userId) throw new StorageNodeError("An authorized actor is required to deactivate a storage node.", 403);
  const record = await updateStorageNode(organizationId, userId, valueId, { isActive: false }, database);
  return { record };
}

export async function getActiveBinPlacement(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  binId: string,
  legacyLocationEntityId: string,
) {
  const chain = await findActiveNodeChain(transaction, organizationId, binId, "BIN");
  const site = chain.find((node) => node.node_type === "LOCATION_SITE");
  if (!site || site.entity_id !== legacyLocationEntityId) {
    throw new StorageNodeError("Select a Bin under a Location/Site associated with the selected Entity.", 400);
  }
  return chain[0];
}
