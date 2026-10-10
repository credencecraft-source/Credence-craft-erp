import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, transactionMock, reserveChallanNumberMock, createAuditEventMock } = vi.hoisted(() => {
  const gateEntry = {
    create: vi.fn(),
    findFirst: vi.fn(),
  };
  const transactionMock = { gateEntry };
  const prismaMock = {
    $transaction: vi.fn(),
    gateEntry,
    purchaseOrder: { findMany: vi.fn() },
  };
  return {
    prismaMock,
    transactionMock,
    reserveChallanNumberMock: vi.fn(),
    createAuditEventMock: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: reserveChallanNumberMock,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: createAuditEventMock,
}));

import { createDummySampleGateEntries } from "./dummy-sample-gate-entry-service";

const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);

function samplePurchaseOrders() {
  return purchaseOrderIds.slice(0, 5).map((id, index) => ({
    id,
    purchase_order_no: `PO-${index + 1}`,
    display_no: index + 1,
    vendor: { vendor: `Vendor ${index + 1}` },
    lines: [{ raw_material: `Fabric ${index + 1}`, quantity: new Prisma.Decimal("8") }],
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.purchaseOrder.findMany.mockResolvedValue(samplePurchaseOrders());
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  reserveChallanNumberMock.mockImplementation(async () => "GE-1");
  transactionMock.gateEntry.create.mockImplementation(
    (args: { data: Record<string, unknown> }) => Promise.resolve({ id: `gate-entry-${transactionMock.gateEntry.create.mock.calls.length}`, data: args.data }),
  );
  transactionMock.gateEntry.findFirst.mockResolvedValue(null);
  createAuditEventMock.mockResolvedValue(undefined);
});

describe("dummy sample Gate Entry service", () => {
  it("creates five inward CHALLAN entries, each linked to one approved PO", async () => {
    prismaMock.purchaseOrder.findMany.mockResolvedValue(samplePurchaseOrders());
    reserveChallanNumberMock.mockImplementation(async () => {
      return `GE-${reserveChallanNumberMock.mock.calls.length}`;
    });

    const entries = await createDummySampleGateEntries("org-id", "batch-id", purchaseOrderIds, "actor-id");

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(entries).toHaveLength(5);
    expect(new Set(entries.map((entry) => entry.purchaseOrderId)).size).toBe(5);
    expect(prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-id",
        id: { in: purchaseOrderIds.slice(0, 5) },
        status: { in: ["APPROVED", "SHARED"] },
      }),
    }));
    expect(transactionMock.gateEntry.create).toHaveBeenCalledTimes(5);
    expect(reserveChallanNumberMock).toHaveBeenCalledWith("org-id", "GATE_ENTRY", transactionMock);
    expect(createAuditEventMock).toHaveBeenCalledTimes(5);
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "CREATE_DUMMY_RM_GATE_ENTRY",
    }), transactionMock);
    for (const [index, [call]] of transactionMock.gateEntry.create.mock.calls.entries()) {
      expect(call.data).toMatchObject({
        organization_id: "org-id",
        purchase_order_id: purchaseOrderIds[index],
        direction: "INWARD",
        movement_type: "CHALLAN",
        challan_no: `PO-${index + 1}`,
      });
      expect(call.data.quantity.toString()).toBe(index % 2 === 0 ? "4" : "8");
    }
  });

  it("rejects fewer than ten sample purchase orders", async () => {
    await expect(createDummySampleGateEntries("org-id", "batch-id", purchaseOrderIds.slice(0, 9), "actor-id"))
      .rejects.toThrow("At least ten approved sample Purchase Orders are required");

    expect(prismaMock.purchaseOrder.findMany).not.toHaveBeenCalled();
  });

  it("reuses matching entries when Step 6 is retried", async () => {
    prismaMock.purchaseOrder.findMany.mockResolvedValue(samplePurchaseOrders());
    transactionMock.gateEntry.findFirst.mockImplementation(async ({ where }: { where: { purchase_order_id: string } }) => ({
      id: `existing-${where.purchase_order_id}`,
      direction: "INWARD",
      movement_type: "CHALLAN",
    }));

    const entries = await createDummySampleGateEntries("org-id", "batch-id", purchaseOrderIds, "actor-id");

    expect(entries).toHaveLength(5);
    expect(transactionMock.gateEntry.create).not.toHaveBeenCalled();
  });
});
