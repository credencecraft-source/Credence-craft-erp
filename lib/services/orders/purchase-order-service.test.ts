import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  masterFindMany: vi.fn(),
  purchaseOrderFindMany: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
  purchaseOrderUpdateMany: vi.fn(),
  purchaseOrderDelete: vi.fn(),
  generalPurchaseOrderRequestUpdateMany: vi.fn(),
  approvalRequestCreate: vi.fn(),
  approvalRequestDeleteMany: vi.fn(),
  approvalRequestFindFirst: vi.fn(),
  approvalRequestUpdateMany: vi.fn(),
  auditEventCreate: vi.fn(),
}));

const transaction = {
  masterPurchaseOrder: { findMany: mocks.masterFindMany },
  purchaseOrder: { findFirst: mocks.purchaseOrderFindFirst, updateMany: mocks.purchaseOrderUpdateMany, delete: mocks.purchaseOrderDelete },
  generalPurchaseOrderRequest: { updateMany: mocks.generalPurchaseOrderRequestUpdateMany },
  approvalRequest: {
    create: mocks.approvalRequestCreate,
    deleteMany: mocks.approvalRequestDeleteMany,
    findFirst: mocks.approvalRequestFindFirst,
    updateMany: mocks.approvalRequestUpdateMany,
  },
  auditEvent: { create: mocks.auditEventCreate },
};

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    purchaseOrder: { findMany: mocks.purchaseOrderFindMany, findFirst: mocks.purchaseOrderFindFirst },
  },
}));

import {
  generatePurchaseOrders,
  listPurchaseOrderReportPage,
  reviewPurchaseOrderApprovalRequest,
  deletePurchaseOrder,
  submitPurchaseOrderForApproval,
} from "./purchase-order-service";

describe("vendor Purchase Order generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    mocks.masterFindMany.mockResolvedValue([{
      id: "stock-master-1",
      sourceRecords: [{ groupedPurchaseOrder: { source_type: "STOCK" } }],
    }]);
    mocks.purchaseOrderFindFirst.mockResolvedValue({ id: "po-1", display_no: 42, purchase_order_no: "PO-1" });
    mocks.purchaseOrderUpdateMany.mockResolvedValue({ count: 1 });
    mocks.purchaseOrderDelete.mockResolvedValue({});
    mocks.generalPurchaseOrderRequestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.approvalRequestCreate.mockResolvedValue({ id: "request-1" });
    mocks.approvalRequestDeleteMany.mockResolvedValue({ count: 0 });
    mocks.approvalRequestFindFirst.mockResolvedValue({
      id: "request-1",
      organization_id: "org-1",
      entity_type: "purchase-order",
      entity_ref_id: "po-1",
      requested_by: "Requester",
      requested_by_user_id: "requester-id",
      status: "pending",
    });
    mocks.approvalRequestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditEventCreate.mockResolvedValue({});
  });

  it("rejects stock Master Groups so they must complete store verification instead", async () => {
    await expect(generatePurchaseOrders("org-1", ["stock-master-1"]))
      .rejects.toThrow("Stock Master Groups must be completed through store verification");
  });

  it("submits a tenant-scoped PO and stores requester identity in its pending approval", async () => {
    await submitPurchaseOrderForApproval("org-1", "po-1", "Requester", "requester-id");

    expect(mocks.purchaseOrderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "po-1", organization_id: "org-1", status: { in: ["DRAFT", "OPEN", "REJECTED"] } },
      data: { status: "PENDING_APPROVAL", rejection_reason: null },
    }));
    expect(mocks.approvalRequestCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entity_label: "PO-42",
        requested_by_user_id: "requester-id",
        status: "pending",
      }),
    }));
  });

  it("restores General PO requests when a deletable draft PO is removed", async () => {
    mocks.purchaseOrderFindFirst.mockResolvedValue({
      id: "po-1",
      status: "DRAFT",
      generalPurchaseOrderRequests: [{ id: "request-1", status: "PO_CREATED" }],
      inventoryReceipts: [],
      gateEntries: [],
    });

    await deletePurchaseOrder("org-1", "po-1", "user-1");

    expect(mocks.generalPurchaseOrderRequestUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["request-1"] },
        organization_id: "org-1",
        purchase_order_id: "po-1",
        status: "PO_CREATED",
      },
      data: { status: "PRICE_APPROVED", purchase_order_id: null },
    });
    expect(mocks.purchaseOrderDelete).toHaveBeenCalledWith({
      where: { id: "po-1", organization_id: "org-1" },
    });
  });

  it("does not delete a General PO while it is awaiting approval", async () => {
    mocks.purchaseOrderFindFirst.mockResolvedValue({
      id: "po-1",
      status: "PENDING_APPROVAL",
      generalPurchaseOrderRequests: [{ id: "request-1", status: "PO_CREATED" }],
      inventoryReceipts: [],
      gateEntries: [],
    });

    await expect(deletePurchaseOrder("org-1", "po-1", "user-1"))
      .rejects.toThrow("cannot be deleted after it has been submitted for approval");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows the requester to approve their own pending PO", async () => {
    await expect(reviewPurchaseOrderApprovalRequest("org-1", "request-1", "approved", "Requester", "requester-id"))
      .resolves.toEqual({ status: "approved", purchaseOrderId: "po-1" });
    expect(mocks.approvalRequestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "request-1", organization_id: "org-1", status: "pending" },
      data: expect.objectContaining({ status: "approved", reviewed_by_user_id: "requester-id" }),
    }));
    expect(mocks.purchaseOrderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "po-1", organization_id: "org-1", status: "PENDING_APPROVAL" },
      data: expect.objectContaining({ status: "APPROVED", approved_by: "Requester" }),
    }));
    expect(mocks.auditEventCreate).toHaveBeenCalledOnce();
  });

  it("updates the approval request and PO together for a different authorized reviewer", async () => {
    await expect(reviewPurchaseOrderApprovalRequest("org-1", "request-1", "approved", "Reviewer", "reviewer-id"))
      .resolves.toEqual({ status: "approved", purchaseOrderId: "po-1" });
    expect(mocks.approvalRequestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "request-1", organization_id: "org-1", status: "pending" },
      data: expect.objectContaining({ status: "approved", reviewed_by_user_id: "reviewer-id" }),
    }));
    expect(mocks.purchaseOrderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "po-1", organization_id: "org-1", status: "PENDING_APPROVAL" },
      data: expect.objectContaining({ status: "APPROVED", approved_by: "Reviewer" }),
    }));
    expect(mocks.auditEventCreate).toHaveBeenCalledOnce();
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
        stock_uom: "PCS",
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
        purchaseOrders: [{ id: "po-1", total: 6, lines: [{ buyingUom: "ROLL", hsnCode: "5208", stockUom: "PCS" }] }, { id: "po-2", total: 6 }],
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