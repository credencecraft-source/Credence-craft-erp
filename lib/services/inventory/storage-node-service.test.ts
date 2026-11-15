import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    masterEntity: { findFirst: vi.fn() },
    masterLocation: { findFirst: vi.fn() },
    storageNode: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    transaction,
    storageNode: { findMany: vi.fn() },
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    storageNode: mocks.storageNode,
  },
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));

import {
  createStorageNode,
  getActiveBinPlacement,
  listStorageNodesForOrganization,
  StorageNodeError,
  updateStorageNode,
} from "./storage-node-service";

describe("organization storage hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.masterEntity.findFirst.mockResolvedValue({ id: "entity-1" });
    mocks.transaction.masterLocation.findFirst.mockResolvedValue({ id: "location-1" });
    mocks.transaction.storageNode.count.mockResolvedValue(0);
    mocks.transaction.storageNode.create.mockImplementation(async ({ data }) => ({
      id: "node-created",
      value_id: "node-value",
      organization_id: "org-1",
      ...data,
      is_active: true,
      sort_order: 0,
    }));
    mocks.transaction.storageNode.findFirst.mockResolvedValue(null);
    mocks.transaction.storageNode.findMany.mockResolvedValue([]);
    mocks.storageNode.findMany.mockResolvedValue([]);
    mocks.transaction.storageNode.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("creates a Location/Site only with an active Entity in the same organization and audits it", async () => {
    const node = await createStorageNode("org-1", "user-1", {
      nodeType: "LOCATION_SITE",
      code: "blr",
      name: "Bengaluru",
      entityId: "entity-1",
    });

    expect(node).toMatchObject({ node_type: "LOCATION_SITE", node_code: "BLR", node_name: "BENGALURU" });
    expect(mocks.transaction.masterEntity.findFirst).toHaveBeenCalledWith({
      where: { id: "entity-1", organization_id: "org-1", is_active: true },
      select: { id: true },
    });
    expect(mocks.transaction.storageNode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-1",
        node_type: "LOCATION_SITE",
        entity_id: "entity-1",
        parent_node_id: null,
        parent_node_type: null,
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      userId: "user-1",
      action: "CREATE",
      entityType: "StorageNode",
    }), mocks.transaction);
  });

  it("rejects illegal parent level and foreign-organization parent IDs before creating a node", async () => {
    mocks.transaction.storageNode.findFirst.mockResolvedValue({
      id: "wrong-parent",
      value_id: "wrong-parent-value",
      organization_id: "org-1",
      node_type: "RACK",
      node_code: "RACK-1",
      node_name: "RACK",
      parent_node_id: "store-1",
      parent_node_type: "SUB_STORE",
      entity_id: null,
      is_active: true,
      sort_order: 0,
    });

    await expect(createStorageNode("org-1", "user-1", {
      nodeType: "SUB_STORE",
      code: "STORE-1",
      name: "Fabric Store",
      parentId: "wrong-parent",
    })).rejects.toThrow("Select an active parent at a valid higher hierarchy level.");
    expect(mocks.transaction.storageNode.create).not.toHaveBeenCalled();

    mocks.transaction.storageNode.findFirst.mockResolvedValue(null);
    await expect(createStorageNode("org-1", "user-1", {
      nodeType: "WAREHOUSE",
      code: "WH-2",
      name: "Warehouse",
      parentId: "foreign-site",
    })).rejects.toBeInstanceOf(StorageNodeError);
    expect(mocks.transaction.storageNode.create).not.toHaveBeenCalled();
  });

  it("requires the complete active Site-to-Bin chain and matching Entity for stock placement", async () => {
    const hierarchy = [
      { id: "bin-1", node_type: "BIN", parent_node_id: "rack-1", parent_node_type: "RACK", entity_id: null, is_active: true },
      { id: "rack-1", node_type: "RACK", parent_node_id: "store-1", parent_node_type: "SUB_STORE", entity_id: null, is_active: true },
      { id: "store-1", node_type: "SUB_STORE", parent_node_id: "warehouse-1", parent_node_type: "WAREHOUSE", entity_id: null, is_active: true },
      { id: "warehouse-1", node_type: "WAREHOUSE", parent_node_id: "site-1", parent_node_type: "LOCATION_SITE", entity_id: null, is_active: true },
      { id: "site-1", node_type: "LOCATION_SITE", parent_node_id: null, parent_node_type: null, entity_id: "entity-1", is_active: true },
    ];
    mocks.transaction.storageNode.findFirst.mockImplementation(async ({ where }) =>
      hierarchy.find((node) => node.id === where.id) ?? null,
    );

    await expect(getActiveBinPlacement(
      mocks.transaction as never,
      "org-1",
      "bin-1",
      "entity-1",
    )).resolves.toMatchObject({ id: "bin-1", node_type: "BIN" });

    await expect(getActiveBinPlacement(
      mocks.transaction as never,
      "org-1",
      "bin-1",
      "different-entity",
    )).rejects.toThrow("Select a Bin under a Location/Site associated with the selected Entity.");

    hierarchy[3].is_active = false;
    await expect(getActiveBinPlacement(
      mocks.transaction as never,
      "org-1",
      "bin-1",
      "entity-1",
    )).rejects.toThrow("Select an active storage node belonging to this organization.");
  });

  it("supports a Bin directly under a Location when intermediate levels are unused", async () => {
    const hierarchy = [
      { id: "bin-1", node_type: "BIN", parent_node_id: "site-1", parent_node_type: "LOCATION_SITE", entity_id: null, is_active: true },
      { id: "site-1", node_type: "LOCATION_SITE", parent_node_id: null, parent_node_type: null, entity_id: "entity-1", is_active: true },
    ];
    mocks.transaction.storageNode.findFirst.mockImplementation(async ({ where }) =>
      hierarchy.find((node) => node.id === where.id) ?? null,
    );

    await expect(getActiveBinPlacement(
      mocks.transaction as never,
      "org-1",
      "bin-1",
      "entity-1",
    )).resolves.toMatchObject({ id: "bin-1", node_type: "BIN" });
  });

  it("does not deactivate a node while it has active children", async () => {
    mocks.transaction.storageNode.findFirst.mockResolvedValue({
      id: "site-1",
      value_id: "site-value",
      organization_id: "org-1",
      node_type: "LOCATION_SITE",
      node_code: "BLR",
      node_name: "BENGALURU",
      parent_node_id: null,
      parent_node_type: null,
      entity_id: "entity-1",
      is_active: true,
      sort_order: 0,
    });
    mocks.transaction.storageNode.findMany.mockResolvedValue([{ id: "warehouse-1" }]);

    await expect(updateStorageNode("org-1", "user-1", "site-value", { isActive: false }))
      .rejects.toThrow("Deactivate active child nodes before deactivating this node.");
    expect(mocks.transaction.storageNode.update).not.toHaveBeenCalled();
  });

  it("bounds Bin search to the selected Entity's Location/Site hierarchy", async () => {
    await listStorageNodesForOrganization("org-1", {
      nodeType: "BIN",
      siteEntityId: "entity-1",
      search: "bin",
      limit: 51,
    });

    expect(mocks.storageNode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        is_active: true,
        node_type: "BIN",
        AND: [
          expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ node_type: "BIN", parent: expect.any(Object) }),
            ]),
          }),
        ],
        OR: expect.arrayContaining([
          { node_code: { contains: "bin", mode: "insensitive" } },
          { node_name: { contains: "bin", mode: "insensitive" } },
        ]),
      }),
      take: 51,
    }));
  });

  it("can search all storage hierarchy levels under the selected Entity", async () => {
    await listStorageNodesForOrganization("org-1", {
      siteEntityId: "entity-1",
      search: "store",
      limit: 50,
    });

    expect(mocks.storageNode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        AND: [expect.objectContaining({
          OR: expect.arrayContaining([
            { node_type: "LOCATION_SITE", entity_id: "entity-1", is_active: true },
            expect.objectContaining({ node_type: "WAREHOUSE", parent: expect.any(Object) }),
            expect.objectContaining({ node_type: "SUB_STORE", parent: expect.any(Object) }),
            expect.objectContaining({ node_type: "RACK", parent: expect.any(Object) }),
            expect.objectContaining({ node_type: "BIN", parent: expect.any(Object) }),
          ]),
        })],
        OR: expect.arrayContaining([
          { node_code: { contains: "store", mode: "insensitive" } },
          { node_name: { contains: "store", mode: "insensitive" } },
        ]),
      }),
    }));
  });
});
