import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
  inventoryReceiptFindFirst: vi.fn(),
  inventoryReceiptLineFindMany: vi.fn(),
  inventoryReceiptCreate: vi.fn(),
  locationFindFirst: vi.fn(),
  locationCreate: vi.fn(),
  locationUpdateMany: vi.fn(),
  reserveNumber: vi.fn(),
  createAuditEvent: vi.fn(),
}));

const transaction = {
  purchaseOrder: { findFirst: mocks.purchaseOrderFindFirst },
  inventoryReceipt: { findFirst: mocks.inventoryReceiptFindFirst, create: mocks.inventoryReceiptCreate },
  inventoryReceiptLine: { findMany: mocks.inventoryReceiptLineFindMany },
  masterLocation: {
    findFirst: mocks.locationFindFirst,
    create: mocks.locationCreate,
    updateMany: mocks.locationUpdateMany,
  },
};
type TransactionMock = typeof transaction;

vi.mock("@/lib/database/prisma-client", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: mocks.reserveNumber,
}));

import { createDummySampleGrns } from "./dummy-sample-grn-service";

const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);

function samplePurchaseOrder(id: string, index: number) {
  return {
    id,
    purchase_order_no: `PO-${index + 1}`,
    status: "APPROVED",
    entity_id: "entity-1",
    entity: { id: "entity-1", entity_name: "Demo Entity", is_active: true },
    lines: [{
      id: `po-line-${index + 1}`,
      raw_material: `Demo material ${index + 1}`,
      quantity: new Prisma.Decimal("12"),
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    (callback: (transaction: TransactionMock) => Promise<unknown>) => callback(transaction),
  );
  mocks.purchaseOrderFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const index = purchaseOrderIds.indexOf(where.id);
    return samplePurchaseOrder(where.id, index);
  });
  mocks.inventoryReceiptFindFirst.mockResolvedValue(null);
  mocks.inventoryReceiptLineFindMany.mockResolvedValue([]);
  mocks.inventoryReceiptCreate.mockImplementation(async ({ data }: { data: { receipt_no: string } }) => ({
    id: `receipt-${mocks.inventoryReceiptCreate.mock.calls.length}`,
    receipt_no: data.receipt_no,
  }));
  mocks.locationFindFirst.mockResolvedValue({ id: "location-1" });
  mocks.locationCreate.mockResolvedValue({ id: "created-location" });
  mocks.locationUpdateMany.mockResolvedValue({ count: 1 });
  mocks.reserveNumber.mockImplementation(async () => `GRN-${mocks.reserveNumber.mock.calls.length + 1}`);
  mocks.createAuditEvent.mockResolvedValue(undefined);
});

describe("dummy sample GRN creation", () => {
  it("creates five pending GRNs, each linked to one approved PO", async () => {
    const grns = await createDummySampleGrns("org-1", purchaseOrderIds, "batch-1", "actor-1");

    expect(grns).toHaveLength(5);
    expect(new Set(grns.map((grn) => grn.purchaseOrderId)).size).toBe(5);
    expect(mocks.purchaseOrderFindFirst).toHaveBeenCalledTimes(5);
    expect(mocks.inventoryReceiptCreate).toHaveBeenCalledTimes(5);
    for (const [index, [call]] of mocks.inventoryReceiptCreate.mock.calls.entries()) {
      expect(call.data).toMatchObject({
        organization_id: "org-1",
        entity_id: "entity-1",
        location_id: "location-1",
        purchase_order_id: purchaseOrderIds[index],
        notes: "Dummy sample batch batch-1",
      });
      expect(call.data.lines.create[0]).toMatchObject({
        purchase_order_line_id: `po-line-${index + 1}`,
        received_quantity: new Prisma.Decimal(index % 2 === 0 ? "6" : "12"),
        accepted_quantity: new Prisma.Decimal(index % 2 === 0 ? "6" : "12"),
        rejected_quantity: new Prisma.Decimal("0"),
      });
    }
    expect(mocks.reserveNumber).toHaveBeenCalledTimes(5);
  });

  it("creates an active master receiving location when the PO entity has none", async () => {
    mocks.locationFindFirst.mockResolvedValue(null);

    await createDummySampleGrns("org-1", purchaseOrderIds, "batch-1", "actor-1");

    expect(mocks.locationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        organization_id: "org-1",
        entity_id: "entity-1",
        location_name: "Sample Receiving - Demo Entity - entity-1",
        is_active: true,
      },
      select: { id: true },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      module: "Master Data",
      action: "CREATE_DUMMY_RECEIVING_LOCATION",
      entityType: "MasterLocation",
      entityId: "created-location",
    }), transaction);
  });

  it("reuses existing batch GRNs when Step 6 is retried", async () => {
    mocks.inventoryReceiptFindFirst.mockImplementation(async ({ where }: { where: { purchase_order_id: string } }) => ({
      id: `existing-${where.purchase_order_id}`,
      purchase_order_id: where.purchase_order_id,
    }));

    const grns = await createDummySampleGrns("org-1", purchaseOrderIds, "batch-1", "actor-1");

    expect(grns).toHaveLength(5);
    expect(mocks.inventoryReceiptCreate).not.toHaveBeenCalled();
    expect(mocks.purchaseOrderFindFirst).not.toHaveBeenCalled();
  });

  it("rejects fewer than ten sample POs", async () => {
    await expect(createDummySampleGrns("org-1", purchaseOrderIds.slice(0, 9), "batch-1", "actor-1"))
      .rejects.toThrow("At least ten approved sample Purchase Orders are required");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not create a GRN for an unapproved PO", async () => {
    mocks.purchaseOrderFindFirst.mockResolvedValue({
      ...samplePurchaseOrder(purchaseOrderIds[0], 0),
      status: "PENDING_APPROVAL",
    });

    await expect(createDummySampleGrns("org-1", purchaseOrderIds, "batch-1", "actor-1"))
      .rejects.toThrow("Only approved sample Purchase Orders can receive a sample GRN.");
    expect(mocks.inventoryReceiptCreate).not.toHaveBeenCalled();
  });
});
