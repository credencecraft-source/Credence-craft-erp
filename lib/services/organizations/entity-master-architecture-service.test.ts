import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    division: { create: vi.fn(), update: vi.fn() },
    entityGstRegistration: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    masterEntity: { findFirst: vi.fn() },
    masterLocation: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    storageNode: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
      division: { findFirst: vi.fn(), findMany: vi.fn() },
      entityGstRegistration: { findFirst: vi.fn(), findMany: vi.fn() },
      masterEntity: { findFirst: vi.fn() },
      masterLocation: { findFirst: vi.fn(), findMany: vi.fn() },
      storageNode: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    requireOrganizationContext: vi.fn(),
    requireOrganizationPermission: vi.fn(),
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  createEntityDivision,
  createDivisionLocation,
  createEntityGstRegistration,
  createLocationSubLocation,
  createSubSubLocation,
  listDivisionLocations,
  listDivisionsForEntity,
  listLocationSubLocations,
  getEntitySubLocationFolder,
  listSubSubLocations,
  EntityMasterArchitectureError,
  listEntityDivisions,
  updateEntityDivision,
} from "./entity-master-architecture-service";

describe("entity master architecture service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationContext.mockResolvedValue({ id: "org-internal" });
    mocks.requireOrganizationPermission.mockResolvedValue({ organization_id: "org-internal" });
    mocks.prisma.division.findMany.mockResolvedValue([{ id: "division-1", entity_id: "entity-1" }]);
    mocks.prisma.division.findFirst.mockResolvedValue({
      id: "division-1",
      entity_id: "entity-1",
      division_name: "Factory Division",
      division_code: "DEFAULT",
      description: null,
      is_active: true,
    });
    mocks.prisma.masterEntity.findFirst.mockResolvedValue({
      id: "entity-1",
      entity_name: "Factory",
      is_active: true,
    });
    mocks.transaction.division.update.mockResolvedValue({
      id: "division-1",
      division_name: "Factory Division",
      division_code: "DEFAULT",
      is_active: true,
    });
    mocks.transaction.division.create.mockResolvedValue({
      id: "division-2",
      entity_id: "entity-1",
      division_name: "New Division",
      division_code: "NORTH",
      description: null,
      is_active: true,
    });
    mocks.transaction.masterLocation.count.mockResolvedValue(0);
    mocks.transaction.masterLocation.findFirst.mockResolvedValue({ id: "location-1" });
    mocks.transaction.masterEntity.findFirst.mockResolvedValue({ id: "entity-1" });
    mocks.transaction.masterLocation.create.mockResolvedValue({
      id: "location-1",
      value_id: "location-value-1",
      location_name: "Main Store",
      is_active: true,
    });
    mocks.transaction.storageNode.count.mockResolvedValue(0);
    mocks.transaction.storageNode.findFirst.mockResolvedValue(null);
    mocks.transaction.storageNode.create.mockResolvedValue({
      id: "site-1",
      node_type: "LOCATION_SITE",
      node_code: "LOC-location-1",
      node_name: "MAIN STORE",
      parent_node_id: null,
      entity_id: "entity-1",
      master_location_id: "location-1",
    });
    mocks.prisma.masterLocation.findMany.mockResolvedValue([{ id: "location-1" }]);
    mocks.prisma.masterLocation.findFirst.mockResolvedValue({
      id: "location-1",
      location_name: "Main Store",
      is_active: true,
    });
    mocks.prisma.storageNode.findFirst.mockResolvedValue({
      id: "site-1",
      node_name: "Main Store",
      is_active: true,
    });
    mocks.prisma.storageNode.findMany.mockResolvedValue([{ id: "warehouse-1" }]);
    mocks.transaction.entityGstRegistration.findFirst.mockResolvedValue(null);
    mocks.transaction.entityGstRegistration.create.mockResolvedValue({
      id: "gst-registration-1",
      gstin: "29ABCDE1234F1Z5",
      registration_state: "KARNATAKA",
      registration_type: "REGULAR",
      effective_from: new Date("2026-01-01T00:00:00.000Z"),
      effective_to: null,
      is_active: true,
    });
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("lists divisions using the organization resolved from the public route ID", async () => {
    await listEntityDivisions("user-1", "public-org");

    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.prisma.division.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal" },
    }));
  });

  it("lists divisions only for the selected Entity within the authorized organization", async () => {
    await listDivisionsForEntity("user-1", "public-org", "entity-1");

    expect(mocks.prisma.masterEntity.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        OR: [{ id: "entity-1" }, { value_id: "entity-1" }],
      },
    }));
    expect(mocks.prisma.division.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", entity_id: "entity-1" },
    }));
  });

  it("lists only Locations assigned to the selected Entity Division", async () => {
    await listDivisionLocations("user-1", "public-org", "entity-1", "division-1");

    expect(mocks.prisma.masterLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        entity_id: "entity-1",
        division_id: "division-1",
      },
    }));
  });

  it("creates a Division Location and its explicitly linked storage Site in one transaction", async () => {
    await createDivisionLocation("user-1", "public-org", "entity-1", "division-1", {
      locationName: "Main Store",
    });

    expect(mocks.transaction.masterLocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-internal",
        entity_id: "entity-1",
        division_id: "division-1",
        location_name: "MAIN STORE",
      }),
    }));
    expect(mocks.transaction.storageNode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        node_type: "LOCATION_SITE",
        entity_id: "entity-1",
        master_location_id: "location-1",
      }),
    }));
  });

  it("lists Sub-locations only beneath the selected organization-owned Location site", async () => {
    await listLocationSubLocations("user-1", "public-org", "entity-1", "division-1", "location-1");

    expect(mocks.prisma.storageNode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        parent_node_id: "site-1",
        node_type: "WAREHOUSE",
      },
    }));
  });

  it("finds a Sub-location by its tenant-scoped Location Site parent, not child entity_id", async () => {
    mocks.prisma.storageNode.findFirst
      .mockResolvedValueOnce({ id: "site-1", node_name: "Main Store", is_active: true })
      .mockResolvedValueOnce({ id: "warehouse-1", node_name: "Warehouse", node_code: "WH-01", is_active: true });

    await getEntitySubLocationFolder(
      "user-1",
      "public-org",
      "entity-1",
      "division-1",
      "location-1",
      "warehouse-1",
    );

    expect(mocks.prisma.storageNode.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        id: "warehouse-1",
        organization_id: "org-internal",
        parent_node_id: "site-1",
        node_type: "WAREHOUSE",
      },
    }));
  });

  it("lists Sub-sub-locations under the selected Sub-location without requiring a child entity_id", async () => {
    mocks.prisma.storageNode.findFirst
      .mockResolvedValueOnce({ id: "site-1", node_name: "Main Store", is_active: true })
      .mockResolvedValueOnce({ id: "warehouse-1", node_name: "Warehouse", node_code: "WH-01", is_active: true });

    await listSubSubLocations(
      "user-1",
      "public-org",
      "entity-1",
      "division-1",
      "location-1",
      "warehouse-1",
    );

    expect(mocks.prisma.storageNode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal",
        parent_node_id: "warehouse-1",
        node_type: "SUB_STORE",
      },
    }));
  });

  it("creates a Sub-location beneath the mapped Location site", async () => {
    mocks.transaction.storageNode.findFirst.mockResolvedValue({
      id: "site-1",
      node_type: "LOCATION_SITE",
      parent_node_id: null,
      parent_node_type: null,
      is_active: true,
    });
    mocks.transaction.storageNode.create.mockResolvedValue({
      id: "warehouse-1",
      node_type: "WAREHOUSE",
      node_code: "WH-01",
      node_name: "Warehouse",
      parent_node_id: "site-1",
      parent_node_type: "LOCATION_SITE",
      entity_id: null,
      master_location_id: null,
    });

    await createLocationSubLocation(
      "user-1",
      "public-org",
      "entity-1",
      "division-1",
      "location-1",
      { name: "Warehouse", code: "WH-01" },
    );

    expect(mocks.transaction.storageNode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        node_type: "WAREHOUSE",
        parent_node_id: "site-1",
      }),
    }));
  });

  it("creates a Sub-sub-location beneath the selected Sub-location", async () => {
    mocks.prisma.storageNode.findFirst
      .mockResolvedValueOnce({ id: "site-1", is_active: true })
      .mockResolvedValueOnce({ id: "warehouse-1", node_name: "Warehouse", node_code: "WH-01", is_active: true });
    mocks.transaction.storageNode.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === "warehouse-1"
        ? {
          id: "warehouse-1",
          node_type: "WAREHOUSE",
          parent_node_id: "site-1",
          parent_node_type: "LOCATION_SITE",
          is_active: true,
        }
        : {
          id: "site-1",
          node_type: "LOCATION_SITE",
          parent_node_id: null,
          parent_node_type: null,
          is_active: true,
        }
    ));
    mocks.transaction.storageNode.create.mockResolvedValue({
      id: "sub-store-1",
      node_type: "SUB_STORE",
      node_code: "SS-01",
      node_name: "Sub-store",
      parent_node_id: "warehouse-1",
      entity_id: null,
      master_location_id: null,
    });

    await createSubSubLocation(
      "user-1",
      "public-org",
      "entity-1",
      "division-1",
      "location-1",
      "warehouse-1",
      { name: "Sub-store", code: "SS-01" },
    );

    expect(mocks.transaction.storageNode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        node_type: "SUB_STORE",
        parent_node_id: "warehouse-1",
      }),
    }));
  });

  it("updates only the organization-scoped Division and records an audit event", async () => {
    await updateEntityDivision("user-1", "public-org", "division-1", {
      divisionName: "Factory Division",
      divisionCode: "DEFAULT",
      description: "Factory operations",
      isActive: false,
    });

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "MANAGE_MASTER_DATA",
    );
    expect(mocks.prisma.division.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "division-1", organization_id: "org-internal" },
    }));
    expect(mocks.transaction.division.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "division-1" },
      data: expect.objectContaining({ division_name: "FACTORY DIVISION", is_active: false }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-internal",
      entityType: "Division",
      entityId: "division-1",
    }), mocks.transaction);
  });

  it("creates additional divisions under the authorized Entity and audits the creation", async () => {
    await createEntityDivision("user-1", "public-org", "entity-1", {
      divisionName: "New Division",
      divisionCode: "north",
    });

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "MANAGE_MASTER_DATA",
    );
    expect(mocks.prisma.masterEntity.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-internal", OR: [{ id: "entity-1" }, { value_id: "entity-1" }] },
      select: { id: true, entity_name: true, is_active: true },
    });
    expect(mocks.transaction.division.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-internal",
        entity_id: "entity-1",
        division_name: "NEW DIVISION",
        division_code: "NORTH",
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "CREATE",
      entityType: "Division",
      entityId: "division-2",
    }), mocks.transaction);
  });

  it("prevents deactivating a Division that still owns active Locations", async () => {
    mocks.transaction.masterLocation.count.mockResolvedValue(1);

    await expect(updateEntityDivision("user-1", "public-org", "division-1", {
      divisionName: "Factory Division",
      divisionCode: "DEFAULT",
      isActive: false,
    })).rejects.toThrow("Deactivate or reassign active Locations before deactivating this Division.");

    expect(mocks.transaction.division.update).not.toHaveBeenCalled();
  });

  it("rejects malformed GSTIN before querying or writing registration records", async () => {
    await expect(createEntityGstRegistration("user-1", "public-org", "entity-1", {
      gstin: "invalid",
      registrationState: "Karnataka",
      registrationType: "REGULAR",
      effectiveFrom: "2026-01-01",
    })).rejects.toBeInstanceOf(EntityMasterArchitectureError);

    expect(mocks.transaction.entityGstRegistration.create).not.toHaveBeenCalled();
  });

  it("creates a valid tenant-scoped GST registration and audits only a masked GSTIN", async () => {
    await createEntityGstRegistration("user-1", "public-org", "entity-1", {
      gstin: "29ABCDE1234F1Z5",
      registrationState: "Karnataka",
      registrationType: "REGULAR",
      effectiveFrom: "2026-01-01",
    });

    expect(mocks.prisma.masterEntity.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-internal", OR: [{ id: "entity-1" }, { value_id: "entity-1" }] },
      select: { id: true, entity_name: true, is_active: true },
    });
    expect(mocks.transaction.entityGstRegistration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-internal",
        entity_id: "entity-1",
        gstin: "29ABCDE1234F1Z5",
        registration_state: "KARNATAKA",
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ gstinSuffix: "F1Z5" }),
    }), mocks.transaction);
  });

  it("allows only one active GST registration over any effective date range per Entity", async () => {
    mocks.transaction.entityGstRegistration.findFirst.mockResolvedValue({ id: "existing-active-registration" });

    await expect(createEntityGstRegistration("user-1", "public-org", "entity-1", {
      gstin: "29ABCDE1234F1Z5",
      registrationState: "Karnataka",
      registrationType: "REGULAR",
      effectiveFrom: "2026-01-01",
    })).rejects.toThrow("This Entity already has an active GST registration for an overlapping effective period.");

    expect(mocks.transaction.entityGstRegistration.create).not.toHaveBeenCalled();
  });
});
