import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    masterRawMaterial: { findFirst: vi.fn() },
    masterLocation: { findFirst: vi.fn() },
    rawMaterialStock: { create: vi.fn() },
  };
  return {
    transaction,
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: { $transaction: mocks.prismaTransaction } }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));

import { addRawMaterialStockManually, ManualStockError } from "./rm-manual-stock-service";

describe("manual raw-material stock addition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.masterRawMaterial.findFirst.mockResolvedValue({ id: "material-1", raw_material_name: "Cotton" });
    mocks.transaction.masterLocation.findFirst.mockResolvedValue({ id: "location-1", entity_id: "entity-1", location_name: "Store" });
    mocks.transaction.rawMaterialStock.create.mockResolvedValue({ id: "stock-1" });
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("creates a separate tenant-scoped stock row and audits the manual addition in one transaction", async () => {
    await addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      quantity: "12.50",
      reason: "Opening balance",
    });

    expect(mocks.transaction.masterRawMaterial.findFirst).toHaveBeenCalledWith({
      where: { id: "material-1", organization_id: "internal-org-1", is_active: true },
      select: { id: true, raw_material_name: true },
    });
    expect(mocks.transaction.masterLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "location-1", organization_id: "internal-org-1", is_active: true, entity: { is_active: true } },
    }));
    expect(mocks.transaction.rawMaterialStock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        entity_id: "entity-1",
        location_id: "location-1",
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
      quantity: "1",
      reason: "Opening balance",
    })).rejects.toBeInstanceOf(ManualStockError);

    expect(mocks.transaction.rawMaterialStock.create).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects zero and excessive precision before opening a transaction", async () => {
    await expect(addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      quantity: "0",
      reason: "Opening balance",
    })).rejects.toThrow("Quantity must be greater than zero.");
    await expect(addRawMaterialStockManually({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      quantity: "1.001",
      reason: "Opening balance",
    })).rejects.toThrow("Quantity must be a positive number with up to two decimal places.");
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });
});