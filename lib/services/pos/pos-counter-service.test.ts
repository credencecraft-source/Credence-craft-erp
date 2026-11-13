import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  counterCreate: vi.fn(),
  counterFindMany: vi.fn(),
  storageNodeFindFirst: vi.fn(),
  storageNodeFindMany: vi.fn(),
  masterLocationFindFirst: vi.fn(),
  createAuditEvent: vi.fn(),
  transactionClient: {
    storageNode: { findFirst: vi.fn() },
    masterLocation: { findFirst: vi.fn() },
    posCounter: { create: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    posCounter: {
      create: mocks.counterCreate,
      findMany: mocks.counterFindMany,
    },
    storageNode: {
      findFirst: mocks.storageNodeFindFirst,
      findMany: mocks.storageNodeFindMany,
    },
    masterLocation: { findFirst: mocks.masterLocationFindFirst },
  },
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  createPosCounter,
  listPosCounterLocations,
  listPosCounters,
  PosCounterValidationError,
} from "./pos-counter-service";

describe("POS counter service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (transaction: typeof mocks.transactionClient) => Promise<unknown>) =>
        callback(mocks.transactionClient),
    );
    mocks.transactionClient.storageNode.findFirst
      .mockResolvedValueOnce({
        id: "leaf-1",
        parent_node_id: "warehouse-1",
        parent_node_type: "WAREHOUSE",
      })
      .mockResolvedValueOnce({
        id: "warehouse-1",
        parent_node_id: "site-1",
        parent_node_type: "LOCATION_SITE",
      })
      .mockResolvedValueOnce({
        id: "site-1",
        entity_id: "entity-1",
        master_location_id: "location-1",
        parent_node_id: null,
        parent_node_type: null,
      });
    mocks.transactionClient.masterLocation.findFirst.mockResolvedValue({
      id: "location-1",
      entity_id: "entity-1",
      division_id: "division-1",
    });
    mocks.transactionClient.posCounter.create.mockResolvedValue({
      id: "counter-1",
      counter_name: "FRONT COUNTER",
      sub_sub_location_id: "leaf-1",
      created_at: new Date("2026-11-15T10:00:00.000Z"),
      subSubLocation: {
        id: "leaf-1",
        node_name: "STORE",
        parent: {
          node_name: "WAREHOUSE",
          parent: { node_name: "SITE" },
        },
      },
    });
  });

  it("creates and audits a normalized counter only after resolving an active tenant location", async () => {
    const result = await createPosCounter({
      organizationId: "internal-org-1",
      actorId: "user-1",
      counterName: "Front Counter",
      subSubLocationId: "leaf-1",
    });

    expect(mocks.transactionClient.storageNode.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "leaf-1",
          organization_id: "internal-org-1",
          node_type: "SUB_STORE",
          is_active: true,
        }),
      }),
    );
    expect(mocks.transactionClient.posCounter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organization_id: "internal-org-1",
          counter_name: "FRONT COUNTER",
          sub_sub_location_id: "leaf-1",
          created_by: "user-1",
        },
      }),
    );
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "internal-org-1",
        userId: "user-1",
        action: "CREATE_POS_COUNTER",
        entityId: "counter-1",
      }),
      mocks.transactionClient,
    );
    expect(result).toMatchObject({
      counterName: "FRONT COUNTER",
      subSubLocationPath: "SITE / WAREHOUSE / STORE",
    });
  });

  it("rejects a leaf outside the authorized organization before creating a counter", async () => {
    mocks.transactionClient.storageNode.findFirst.mockReset().mockResolvedValue(null);

    await expect(createPosCounter({
      organizationId: "internal-org-1",
      actorId: "user-1",
      counterName: "Counter",
      subSubLocationId: "foreign-leaf",
    })).rejects.toBeInstanceOf(PosCounterValidationError);

    expect(mocks.transactionClient.posCounter.create).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("keeps report queries tenant-scoped and bounds search results", async () => {
    mocks.counterFindMany.mockResolvedValue([]);

    await listPosCounters({
      organizationId: "internal-org-1",
      search: "front",
      limit: 25,
    });

    expect(mocks.counterFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { counter_name: { contains: "FRONT", mode: "insensitive" } },
            ]),
          }),
        ]),
      }),
      take: 26,
    }));
  });

  it("offers only active sub-sub-locations from the authorized storage hierarchy", async () => {
    mocks.storageNodeFindMany.mockResolvedValue([]);

    await listPosCounterLocations({
      organizationId: "internal-org-1",
      limit: 25,
    });

    expect(mocks.storageNodeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        node_type: "SUB_STORE",
        is_active: true,
        parent: expect.objectContaining({
          is: expect.objectContaining({
            organization_id: "internal-org-1",
            node_type: "WAREHOUSE",
            is_active: true,
          }),
        }),
      }),
      take: 26,
    }));
  });
});
