import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  moduleFindFirst: vi.fn(),
  locationFindMany: vi.fn(),
  stockGroupBy: vi.fn(),
  stockFindMany: vi.fn(),
  listStorageNodes: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    eRPModule: { findFirst: mocks.moduleFindFirst },
    masterLocation: { findMany: mocks.locationFindMany },
    finishedGoodsSkuStock: {
      groupBy: mocks.stockGroupBy,
      findMany: mocks.stockFindMany,
    },
  },
}));
vi.mock("@/lib/services/inventory/storage-node-service", () => ({
  listStorageNodesForOrganization: mocks.listStorageNodes,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.audit,
}));

import {
  listEnabledOnlineStoreLocations,
  listOrganizationOnlineStoreInventory,
  resolveOnlineStoreInventoryPath,
} from "./online-store-inventory-service";

const location = {
  id: "location-1",
  entity_id: "entity-1",
  location_name: "Main Location",
  is_active: true,
  entity: { entity_name: "Retail Entity", is_active: true },
  division: { is_active: true },
};

const nodes = [
  {
    id: "site-1",
    value_id: "site-value-1",
    label: "Main Location",
    code: "SITE-1",
    is_active: true,
    parent_id: null,
    fields: {
      node_type: "LOCATION_SITE",
      master_location_id: "location-1",
      entity_id: "entity-1",
      site_entity_id: "entity-1",
    },
  },
  {
    id: "warehouse-1",
    value_id: "warehouse-value-1",
    label: "Warehouse A",
    code: "WH-A",
    is_active: true,
    parent_id: "site-1",
    fields: { node_type: "WAREHOUSE", parent_node_id: "site-1", site_entity_id: "entity-1" },
  },
  {
    id: "sub-store-1",
    value_id: "sub-store-value-1",
    label: "Finished Goods",
    code: "FG-1",
    is_active: true,
    parent_id: "warehouse-1",
    fields: { node_type: "SUB_STORE", parent_node_id: "warehouse-1", site_entity_id: "entity-1" },
  },
];

describe("online-store inventory hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moduleFindFirst.mockResolvedValue({
      id: "pos-module-1",
      settings: { onlineStoreLocationIds: ["location-1"] },
    });
    mocks.locationFindMany.mockResolvedValue([location]);
    mocks.stockGroupBy.mockImplementation(({ by }: { by: string[] }) => Promise.resolve(
      by[0] === "location_id"
        ? [{
            location_id: "location-1",
            _sum: { current_stock: new Prisma.Decimal(7) },
            _count: { _all: 1 },
          }]
        : [{
            storage_node_id: "sub-store-1",
            location_id: "location-1",
            entity_id: "entity-1",
            _sum: { current_stock: new Prisma.Decimal(7) },
            _count: { _all: 1 },
          }],
    ));
    mocks.stockFindMany.mockResolvedValue([{
      id: "sku-1",
      style_name: "Classic Shirt",
      article_no: "ART-1",
      brand: "Brand",
      colour: "Navy",
      size: "M",
      current_stock: new Prisma.Decimal(7),
      sales_price: new Prisma.Decimal("125.00"),
      mrp: new Prisma.Decimal("150.00"),
    }]);
    mocks.listStorageNodes.mockResolvedValue(nodes);
  });

  it("maps enabled store locations to their full storage hierarchy and stock totals", async () => {
    const inventory = await listOrganizationOnlineStoreInventory("organization-1");

    expect(inventory[0]).toMatchObject({
      id: "location-1",
      entityId: "entity-1",
      onlineEnabled: true,
      stockItemCount: 1,
      availableQuantity: "7",
      subLocations: [{
        name: "Warehouse A",
        subSubLocations: [{
          name: "Finished Goods",
          stockItemCount: 1,
          availableQuantity: "7",
        }],
      }],
    });
    await expect(listEnabledOnlineStoreLocations("organization-1")).resolves.toEqual([{
      id: "location-1",
      entityId: "entity-1",
      name: "Main Location",
      entityName: "Retail Entity",
    }]);
  });

  it("resolves readable hierarchical URLs to tenant-scoped stock details", async () => {
    const inventory = await listOrganizationOnlineStoreInventory("organization-1");
    const locationSegment = inventory[0].segment;
    const subLocationSegment = inventory[0].subLocations[0].segment;
    const subSubLocationSegment = inventory[0].subLocations[0].subSubLocations[0].segment;

    const view = await resolveOnlineStoreInventoryPath("organization-1", [
      locationSegment,
      subLocationSegment,
      subSubLocationSegment,
    ]);

    expect(view).toMatchObject({
      level: "STOCK",
      stockItems: [{ id: "sku-1", styleName: "Classic Shirt", currentStock: "7" }],
      totalStockItemCount: 1,
    });
    expect(mocks.stockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "organization-1",
        location_id: "location-1",
        storage_node_id: "sub-store-1",
      }),
      take: 500,
    }));
    await expect(resolveOnlineStoreInventoryPath("organization-1", ["other-location--foreign"]))
      .resolves.toBeNull();
  });
});
