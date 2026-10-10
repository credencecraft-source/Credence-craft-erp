import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => {
  const inventoryReceiptFindFirst = vi.fn();
  const inventoryReceiptDeleteMany = vi.fn();
  const transaction = {
    purchaseOrder: { findFirst: vi.fn() },
    masterLocation: { findFirst: vi.fn() },
    inventoryReceiptLine: { findMany: vi.fn() },
    inventoryReceipt: { create: vi.fn(), findFirst: inventoryReceiptFindFirst, deleteMany: inventoryReceiptDeleteMany },
    rawMaterialStock: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  };
  return {
    inventoryReceiptFindMany: vi.fn(),
    inventoryReceiptFindFirst,
    inventoryReceiptDeleteMany,
    requireSessionUser: vi.fn(),
    requireOrganizationContext: vi.fn(),
    reserveChallanNumber: vi.fn(),
    createAuditEvent: vi.fn(),
    saveRmGrnVerificationInTransaction: vi.fn(),
    transaction,
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.prismaTransaction, inventoryReceipt: { findMany: mocks.inventoryReceiptFindMany } },
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: mocks.reserveChallanNumber,
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

vi.mock("@/lib/services/inventory/rm-grn-verification-service", () => ({
  saveRmGrnVerificationInTransaction: mocks.saveRmGrnVerificationInTransaction,
}));

import { DELETE, GET, POST } from "./route";

describe("inventory receipt verification posting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", full_name: "Receiver", email: "receiver@example.test" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.reserveChallanNumber.mockResolvedValue("GRN-1");
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.saveRmGrnVerificationInTransaction.mockResolvedValue({ created: true, verificationId: "verification-1" });
    mocks.inventoryReceiptFindMany.mockResolvedValue([]);
    mocks.transaction.purchaseOrder.findFirst.mockResolvedValue({
      id: "po-1",
      status: "APPROVED",
      entity_id: "entity-1",
      entity: { is_active: true },
      lines: [{ id: "po-line-1", quantity: new Prisma.Decimal("8"), raw_material: "Cotton" }],
    });
    mocks.transaction.masterLocation.findFirst.mockResolvedValue({ id: "location-1", entity_id: "entity-1", location_name: "Receiving" });
    mocks.transaction.inventoryReceiptLine.findMany.mockResolvedValue([]);
    mocks.transaction.inventoryReceipt.create.mockResolvedValue({
      id: "receipt-1",
      receipt_no: "GRN-1",
      lines: [{ id: "receipt-line-1", purchase_order_line_id: "po-line-1", raw_material: "Cotton", accepted_quantity: new Prisma.Decimal("4") }],
    });
    mocks.transaction.rawMaterialStock.create.mockResolvedValue({});
    mocks.inventoryReceiptFindFirst.mockResolvedValue(null);
    mocks.inventoryReceiptDeleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.rawMaterialStock.findFirst.mockResolvedValue(null);
    mocks.transaction.rawMaterialStock.updateMany.mockResolvedValue({ count: 1 });
  });

  it("includes saved verification state for receipt report rows", async () => {
    mocks.inventoryReceiptFindMany.mockResolvedValue([{ id: "receipt-1" }]);
    const response = await GET(new Request("http://localhost/api/inventory/receipts?organizationId=public-org"));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.inventoryReceiptFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
      include: expect.objectContaining({
        lines: expect.objectContaining({
          include: expect.objectContaining({
            rmGrnVerification: { select: { id: true } },
          }),
        }),
      }),
    }));
  });

  it("posts receipt counts and verification together without duplicating service-managed excess stock", async () => {
    const response = await POST(new Request("http://localhost/api/inventory/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        purchaseOrderId: "po-1",
        locationId: "location-1",
        lines: [{
          purchaseOrderLineId: "po-line-1",
          verifiedQuantity: "6",
          approvedQuantity: "4",
          allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "4" }],
        }],
      }),
    }));

    expect(response.status).toBe(201);
    const receiptCreate = mocks.transaction.inventoryReceipt.create.mock.calls[0][0];
    const receiptLine = receiptCreate.data.lines.create[0];
    expect(receiptLine.received_quantity.toString()).toBe("6");
    expect(receiptLine.accepted_quantity.toString()).toBe("4");
    expect(receiptLine.rejected_quantity.toString()).toBe("2");
    expect(mocks.saveRmGrnVerificationInTransaction).toHaveBeenCalledWith(
      mocks.transaction,
      "internal-org-1",
      "receipt-line-1",
      { verifiedQuantity: "6", approvedQuantity: "4", allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "4" }] },
      "user-1",
    );
    expect(mocks.transaction.rawMaterialStock.create).not.toHaveBeenCalled();
    expect(mocks.prismaTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("saves an RM GRN and PO subform from only its PO and Location without inserting stock", async () => {
    const response = await POST(new Request("http://localhost/api/inventory/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        purchaseOrderId: "po-1",
        locationId: "location-1",
        createOnly: true,
      }),
    }));

    expect(response.status).toBe(201);
    const receiptCreate = mocks.transaction.inventoryReceipt.create.mock.calls[0][0];
    expect(receiptCreate.data).toMatchObject({
      organization_id: "internal-org-1",
      purchase_order_id: "po-1",
      location_id: "location-1",
    });
    expect(receiptCreate.data.lines.create).toEqual([{
      purchase_order_line_id: "po-line-1",
      raw_material: "Cotton",
      ordered_quantity: new Prisma.Decimal("8"),
      received_quantity: new Prisma.Decimal("0"),
      accepted_quantity: new Prisma.Decimal("0"),
      rejected_quantity: new Prisma.Decimal("0"),
    }]);
    expect(mocks.transaction.rawMaterialStock.create).not.toHaveBeenCalled();
    expect(mocks.saveRmGrnVerificationInTransaction).not.toHaveBeenCalled();
  });

  it("keeps the pending PO quantity ceiling for receipts without verification counts", async () => {
    mocks.transaction.purchaseOrder.findFirst.mockResolvedValue({
      id: "po-1",
      status: "APPROVED",
      entity_id: "entity-1",
      entity: { is_active: true },
      lines: [{ id: "po-line-1", quantity: new Prisma.Decimal("5"), raw_material: "Cotton" }],
    });

    const response = await POST(new Request("http://localhost/api/inventory/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        purchaseOrderId: "po-1",
        locationId: "location-1",
        lines: [{ purchaseOrderLineId: "po-line-1", receivedQuantity: 6, acceptedQuantity: 4, rejectedQuantity: 2 }],
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.transaction.inventoryReceipt.create).not.toHaveBeenCalled();
    expect(mocks.saveRmGrnVerificationInTransaction).not.toHaveBeenCalled();
  });

  it("allows verified receipt overage so excess and rejected quantities can be routed separately", async () => {
    const response = await POST(new Request("http://localhost/api/inventory/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        purchaseOrderId: "po-1",
        locationId: "location-1",
        lines: [{
          purchaseOrderLineId: "po-line-1",
          verifiedQuantity: "10",
          approvedQuantity: "8",
          allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "6" }],
        }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.saveRmGrnVerificationInTransaction).toHaveBeenCalledWith(
      mocks.transaction,
      "internal-org-1",
      "receipt-line-1",
      { verifiedQuantity: "10", approvedQuantity: "8", allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "6" }] },
      "user-1",
    );
  });

  it("reverses accepted stock and deletes the tenant-scoped GRN with its dependent records", async () => {
    mocks.inventoryReceiptFindFirst.mockResolvedValue({
      id: "receipt-1",
      receipt_no: "GRN-1",
      purchase_order_id: "po-1",
      entity_id: "entity-1",
      location_id: "location-1",
      lines: [{ id: "receipt-line-1", raw_material: "Cotton", accepted_quantity: new Prisma.Decimal("4") }],
    });
    mocks.transaction.rawMaterialStock.findFirst.mockResolvedValue({
      id: "stock-1",
      quantity_on_hand: new Prisma.Decimal("10"),
      quantity_reserved: new Prisma.Decimal("2"),
      quantity_issued: new Prisma.Decimal("0"),
    });

    const response = await DELETE(new Request("http://localhost/api/inventory/receipts?organizationId=public-org&receiptId=receipt-1", {
      method: "DELETE",
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "INVENTORY"]);
    expect(mocks.transaction.rawMaterialStock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "stock-1",
        organization_id: "internal-org-1",
      }),
      data: { quantity_on_hand: { decrement: new Prisma.Decimal("4") } },
    }));
    expect(mocks.inventoryReceiptDeleteMany).toHaveBeenCalledWith({
      where: { id: "receipt-1", organization_id: "internal-org-1" },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "DELETE",
      entityType: "InventoryReceipt",
      entityId: "receipt-1",
    }), mocks.transaction);
  });

  it("reverses a pre-migration GRN from the legacy aggregate row", async () => {
    mocks.inventoryReceiptFindFirst.mockResolvedValue({
      id: "receipt-1",
      receipt_no: "GRN-1",
      purchase_order_id: "po-1",
      entity_id: "entity-1",
      location_id: "location-1",
      lines: [{ id: "receipt-line-1", raw_material: "Cotton", accepted_quantity: new Prisma.Decimal("4") }],
    });
    mocks.transaction.rawMaterialStock.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "legacy-stock-1",
        quantity_on_hand: new Prisma.Decimal("10"),
        quantity_reserved: new Prisma.Decimal("2"),
        quantity_issued: new Prisma.Decimal("0"),
      });

    const response = await DELETE(new Request("http://localhost/api/inventory/receipts?organizationId=public-org&receiptId=receipt-1", {
      method: "DELETE",
    }));

    expect(response.status).toBe(200);
    expect(mocks.transaction.rawMaterialStock.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        entity_id: "entity-1",
        location_id: "location-1",
        raw_material: "Cotton",
        source_type: "LEGACY",
      }),
    }));
    expect(mocks.transaction.rawMaterialStock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "legacy-stock-1", organization_id: "internal-org-1" }),
      data: { quantity_on_hand: { decrement: new Prisma.Decimal("4") } },
    }));
  });

  it("keeps the GRN when accepted stock is no longer available to reverse", async () => {
    mocks.inventoryReceiptFindFirst.mockResolvedValue({
      id: "receipt-1",
      receipt_no: "GRN-1",
      purchase_order_id: "po-1",
      entity_id: "entity-1",
      location_id: "location-1",
      lines: [{ id: "receipt-line-1", raw_material: "Cotton", accepted_quantity: new Prisma.Decimal("4") }],
    });
    mocks.transaction.rawMaterialStock.findFirst.mockResolvedValue({
      quantity_on_hand: new Prisma.Decimal("5"),
      quantity_reserved: new Prisma.Decimal("2"),
      quantity_issued: new Prisma.Decimal("0"),
    });

    const response = await DELETE(new Request("http://localhost/api/inventory/receipts?organizationId=public-org&receiptId=receipt-1", {
      method: "DELETE",
    }));

    expect(response.status).toBe(409);
    expect(mocks.transaction.rawMaterialStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.inventoryReceiptDeleteMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("keeps a GRN after style/order allocation so allocated inventory cannot be orphaned", async () => {
    mocks.inventoryReceiptFindFirst.mockResolvedValue({
      id: "receipt-1",
      receipt_no: "GRN-1",
      purchase_order_id: "po-1",
      entity_id: "entity-1",
      location_id: "location-1",
      lines: [{
        id: "receipt-line-1",
        raw_material: "Cotton",
        accepted_quantity: new Prisma.Decimal("110"),
        rmGrnVerification: {
          fresh_excess: new Prisma.Decimal("10"),
          allocations: [{ orderAllocations: [{ id: "order-allocation-1" }] }],
        },
      }],
    });

    const response = await DELETE(new Request("http://localhost/api/inventory/receipts?organizationId=public-org&receiptId=receipt-1", {
      method: "DELETE",
    }));

    expect(response.status).toBe(409);
    expect(mocks.transaction.rawMaterialStock.findFirst).not.toHaveBeenCalled();
    expect(mocks.inventoryReceiptDeleteMany).not.toHaveBeenCalled();
  });
});