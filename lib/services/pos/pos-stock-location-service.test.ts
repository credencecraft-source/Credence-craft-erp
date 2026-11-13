import { describe, expect, it, vi } from "vitest";

import {
  PosStockLocationError,
  resolveActivePosStockLocation,
  type PosStockHierarchy,
} from "./pos-stock-location-service";

function database(options: { inactiveNodeType?: string; locationExists?: boolean } = {}) {
  const storageNode = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.node_type === options.inactiveNodeType) return null;
      if (where.node_type === "SUB_STORE") {
        return { id: "leaf-1", parent_node_id: "sub-1", parent_node_type: "WAREHOUSE" };
      }
      if (where.node_type === "WAREHOUSE") {
        return { id: "sub-1", parent_node_id: "site-1", parent_node_type: "LOCATION_SITE" };
      }
      return { id: "site-1", entity_id: "entity-1", master_location_id: "location-1", parent_node_id: null, parent_node_type: null };
    }),
  };
  const masterLocation = {
    findFirst: vi.fn(async () => options.locationExists === false
      ? null
      : { id: "location-1", entity_id: "entity-1", division_id: "division-1" }),
  };
  return { storageNode, masterLocation };
}

const hierarchy = {
  entityId: "entity-1",
  divisionId: "division-1",
  locationId: "location-1",
  subLocationId: "sub-1",
  subSubLocationId: "leaf-1",
} satisfies PosStockHierarchy;

describe("resolveActivePosStockLocation", () => {
  it("resolves only the selected organization-scoped active five-step path", async () => {
    const databaseMock = database();

    await expect(resolveActivePosStockLocation(databaseMock as unknown as Parameters<typeof resolveActivePosStockLocation>[0], "org-1", hierarchy))
      .resolves.toMatchObject(hierarchy);

    expect(databaseMock.storageNode.findFirst).toHaveBeenCalledTimes(3);
    for (const [call] of databaseMock.storageNode.findFirst.mock.calls) {
      expect(call.where.organization_id).toBe("org-1");
    }
    expect(databaseMock.masterLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        entity_id: "entity-1",
        is_active: true,
      }),
    }));
  });

  it("rejects inactive/missing ancestors and a leaf from a different selected branch", async () => {
    await expect(resolveActivePosStockLocation(
      database({ inactiveNodeType: "WAREHOUSE" }) as unknown as Parameters<typeof resolveActivePosStockLocation>[0],
      "org-1",
      hierarchy,
    )).rejects.toBeInstanceOf(PosStockLocationError);

    const mismatchedSubLocation = {
      ...database(),
      storageNode: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          where.node_type === "SUB_STORE"
            ? { id: "leaf-1", parent_node_id: "other-sub", parent_node_type: "WAREHOUSE" }
            : { id: "sub-1", parent_node_id: "site-1", parent_node_type: "LOCATION_SITE" }),
      },
    };
    await expect(resolveActivePosStockLocation(mismatchedSubLocation as unknown as Parameters<typeof resolveActivePosStockLocation>[0], "org-1", hierarchy))
      .rejects.toBeInstanceOf(PosStockLocationError);
  });

  it("rejects inactive location, division, or entity ancestry", async () => {
    await expect(resolveActivePosStockLocation(
      database({ locationExists: false }) as unknown as Parameters<typeof resolveActivePosStockLocation>[0],
      "org-1",
      hierarchy,
    )).rejects.toBeInstanceOf(PosStockLocationError);
  });
});
