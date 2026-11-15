import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class StorageNodeError extends Error {
    constructor(message: string, readonly status: number = 400) {
      super(message);
    }
  }
  const transaction = {
    masterRawMaterial: { findFirst: vi.fn() },
    masterLocation: { findFirst: vi.fn() },
    rawMaterialStock: { create: vi.fn() },
  };
  return {
    transaction,
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
    createAuditEvent: vi.fn(),
    getActiveStoragePlacement: vi.fn(),
    StorageNodeError,
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: { $transaction: mocks.prismaTransaction } }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/inventory/storage-node-service", () => ({
  getActiveStoragePlacement: mocks.getActiveStoragePlacement,
  StorageNodeError: mocks.StorageNodeError,
}));

import { addRawMaterialStockManually, ManualStockError } from "./rm-manual-stock-service";

describe("manual raw-material stock addition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.masterRawMaterial.findFirst.mockResolvedValue({ id: "material-1", raw_material_name: "Cotton", is_asset: false });
    mocks.transaction.masterLocation.findFirst.mockResolvedValue({ id: "location-1", entity_id: "entity-1", location_name: "Store" });
    mocks.getActiveStoragePlacement.mockResolvedValue({ id: "bin-1", node_code: "BIN-01" });
    mocks.transaction.rawMaterialStock.create.mockResolvedValue({ id: "stock-1" });
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("creates a separate tenant-scoped stock row and audits the manual addition in one transaction", async () => {
    await addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      storageNodeId: "bin-1",
      quantity: "12.50",
      reason: "Opening balance",
    });

    expect(mocks.transaction.masterRawMaterial.findFirst).toHaveBeenCalledWith({
      where: { id: "material-1", organization_id: "internal-org-1", is_active: true },
      select: { id: true, raw_material_name: true, is_asset: true },
    });
    expect(mocks.transaction.masterLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "location-1", organization_id: "internal-org-1", is_active: true, entity: { is_active: true } },
    }));
    expect(mocks.getActiveStoragePlacement).toHaveBeenCalledWith(
      mocks.transaction,
      "internal-org-1",
      "bin-1",
      "entity-1",
      "location-1",
    );
    expect(mocks.transaction.rawMaterialStock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        entity_id: "entity-1",
        location_id: "location-1",
        storage_node_id: "bin-1",
        raw_material: "Cotton",
        source_type: "MANUAL",
      }),
    }));
    expect(mocks.transaction.rawMaterialStock.create.mock.calls[0][0].data.quantity_on_hand.toString()).toBe("12.5");
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      userId: "user-1",
      action: "MANUAL_ADD",
      entityType: "RawMaterialStock",
      entityId: "stock-1",
      details: expect.objectContaining({ quantity_added: "12.5", reason: "Opening balance" }),
    }), mocks.transaction);
    expect(mocks.prismaTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("rejects a raw-material ID outside the organization without writing stock", async () => {
    mocks.transaction.masterRawMaterial.findFirst.mockResolvedValue(null);

    await expect(addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "foreign-material",
      locationId: "location-1",
      storageNodeId: "bin-1",
      quantity: "1",
      reason: "Opening balance",
    })).rejects.toBeInstanceOf(ManualStockError);

    expect(mocks.transaction.rawMaterialStock.create).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects asset materials from the ordinary RM stock action", async () => {
    mocks.transaction.masterRawMaterial.findFirst.mockResolvedValue({
      id: "material-1",
      raw_material_name: "Machine",
      is_asset: true,
    });

    await expect(addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      storageNodeId: "bin-1",
      quantity: "1",
      reason: "Opening balance",
    })).rejects.toThrow("Asset-classified materials can only be added through Assets Stock.");

    expect(mocks.transaction.rawMaterialStock.create).not.toHaveBeenCalled();
  });

  it("allows an asset material through the Assets Stock action", async () => {
    mocks.transaction.masterRawMaterial.findFirst.mockResolvedValue({
      id: "material-1",
      raw_material_name: "Machine",
      is_asset: true,
    });

    await addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      storageNodeId: "bin-1",
      quantity: "1",
      reason: "Opening balance",
      isAssetStock: true,
    });

    expect(mocks.transaction.rawMaterialStock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ raw_material: "Machine", source_type: "MANUAL" }),
    }));
  });

  it("does not post stock when the selected Bin is not a legal active placement", async () => {
    mocks.getActiveStoragePlacement.mockRejectedValue(new mocks.StorageNodeError(
      "Select a storage location under a Location/Site associated with the selected Entity.",
    ));

    await expect(addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      storageNodeId: "bin-1",
      quantity: "1",
      reason: "Opening balance",
    })).rejects.toThrow("Select a storage location under a Location/Site associated with the selected Entity.");

    expect(mocks.transaction.rawMaterialStock.create).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("allows stock at the selected operational location without a storage placement", async () => {
    await addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      quantity: "3",
      reason: "Location-level stock",
    });

    expect(mocks.getActiveStoragePlacement).not.toHaveBeenCalled();
    expect(mocks.transaction.rawMaterialStock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ location_id: "location-1", storage_node_id: null }),
    }));
  });

  it("rejects zero and excessive precision before opening a transaction", async () => {
    await expect(addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      storageNodeId: "bin-1",
      quantity: "0",
      reason: "Opening balance",
    })).rejects.toThrow("Quantity must be greater than zero.");
    await expect(addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      storageNodeId: "bin-1",
      quantity: "1.001",
      reason: "Opening balance",
    })).rejects.toThrow("Quantity must be a positive number with up to two decimal places.");
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });
});