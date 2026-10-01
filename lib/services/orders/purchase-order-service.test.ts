import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  masterFindMany: vi.fn(),
  purchaseOrderFindMany: vi.fn(),
}));

const transaction = { masterPurchaseOrder: { findMany: mocks.masterFindMany } };

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    purchaseOrder: { findMany: mocks.purchaseOrderFindMany },
  },
}));

import { generatePurchaseOrders, listPurchaseOrderReportPage } from "./purchase-order-service";

describe("vendor Purchase Order generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    mocks.masterFindMany.mockResolvedValue([{
      id: "stock-master-1",
      sourceRecords: [{ groupedPurchaseOrder: { source_type: "STOCK" } }],
    }]);
  });

  it("rejects stock Master Groups so they must complete store verification instead", async () => {
    await expect(generatePurchaseOrders("org-1", ["stock-master-1"]))
      .rejects.toThrow("Stock Master Groups must be completed through store verification");
  });

  it("returns a tenant-scoped compact Purchase Order report page", async () => {
    const reportOrder = (id: string) => ({
      id,
      entity_id: "entity-1",
      entity: { id: "entity-1", entity_name: "Factory" },
      display_no: 1,
      purchase_order_no: `PO-${id}`,
      status: "DRAFT",
      po_date: new Date("2026-10-01T00:00:00Z"),
      delivery_date: null,
      created_at: new Date("2026-10-01T00:00:00Z"),
      vendor: { id: "vendor-1", vendor: "Vendor", legacy_metadata: null },
      lines: [{
        total: null,
        quantity: new Prisma.Decimal("3"),
        price: new Prisma.Decimal("2"),
        gst: new Prisma.Decimal("5"),
        hsn_code: "5208",
        masterPurchaseOrder: { lines: [{ stock_uom: "MTR" }], sourceRecords: [{ groupedPurchaseOrder: { buying_uom: "ROLL" } }] },
      }],
    });
    mocks.purchaseOrderFindMany.mockResolvedValue([
      reportOrder("po-1"),
      reportOrder("po-2"),
      reportOrder("po-3"),
    ]);

    await expect(listPurchaseOrderReportPage("org-1", { cursor: "previous-page", limit: 2, search: "Factory" }))
      .resolves.toMatchObject({
        purchaseOrders: [{ id: "po-1", total: 6, lines: [{ buyingUom: "ROLL", hsnCode: "5208" }] }, { id: "po-2", total: 6 }],
        nextCursor: "po-2",
      });
    expect(mocks.purchaseOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        OR: expect.arrayContaining([
          { purchase_order_no: { contains: "Factory", mode: "insensitive" } },
          { entity: { entity_name: { contains: "Factory", mode: "insensitive" } } },
        ]),
      }),
      take: 3,
      cursor: { id: "previous-page" },
      skip: 1,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: expect.objectContaining({ lines: expect.any(Object) }),
    }));
  });
});