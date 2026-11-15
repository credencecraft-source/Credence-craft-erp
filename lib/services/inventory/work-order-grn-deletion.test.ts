import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  transaction: {
    workOrderInventoryGrn: { findMany: vi.fn(), deleteMany: vi.fn() },
    posSalesInvoiceLine: { findMany: vi.fn() },
    fGMaterialIssueLine: { findMany: vi.fn() },
    finishedGoodsOutwardRequestLine: { findMany: vi.fn(), deleteMany: vi.fn() },
    finishedGoodsOutwardBoxLine: { deleteMany: vi.fn() },
    finishedGoodsGeneralStockReceipt: { deleteMany: vi.fn() },
    finishedGoodsAllocatedStockReceipt: { deleteMany: vi.fn() },
    workOrderInventoryGrnBookingAllocation: { deleteMany: vi.fn() },
    finishedGoodsStock: { updateMany: vi.fn() },
  },
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));

import { deleteWorkOrderInventoryGrns } from "./work-order-grn-service";

const emptyGrn = {
  id: "grn-1",
  grn_no: "FGRN-1",
  work_order_id: "work-order-1",
  status: "PENDING_VERIFICATION",
  lines: [{ id: "line-1", generalStockReceipt: null, bookingAllocations: [] }],
};

describe("deleteWorkOrderInventoryGrns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([structuredClone(emptyGrn)]);
    mocks.transaction.workOrderInventoryGrn.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.posSalesInvoiceLine.findMany.mockResolvedValue([]);
    mocks.transaction.fGMaterialIssueLine.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsOutwardRequestLine.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.finishedGoodsOutwardBoxLine.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.finishedGoodsGeneralStockReceipt.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.finishedGoodsAllocatedStockReceipt.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.workOrderInventoryGrnBookingAllocation.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.finishedGoodsStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.prisma.$transaction.mockImplementation(
      (callback: (database: typeof mocks.transaction) => Promise<unknown>) => callback(mocks.transaction),
    );
  });

  it("deletes unverified GRNs tenant-scoped and audits the deletion in one transaction", async () => {
    const result = await deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["grn-1"]);

    expect(result).toEqual([{ id: "grn-1", grnNo: "FGRN-1" }]);
    expect(mocks.transaction.workOrderInventoryGrn.findMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["grn-1"] } },
      select: expect.objectContaining({ lines: expect.any(Object) }),
    });
    expect(mocks.transaction.workOrderInventoryGrn.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["grn-1"] } },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      userId: "user-1",
      action: "DELETE_WORK_ORDER_GRN",
      entityId: "grn-1",
      details: expect.objectContaining({
        grn_no: "FGRN-1",
        deleted_line_ids: ["line-1"],
      }),
    }), mocks.transaction);
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("allows verified GRNs with zero issued quantity and reverses stock, reservations, and allocations", async () => {
    mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([{
      ...structuredClone(emptyGrn),
      status: "VERIFIED",
      lines: [{
        id: "line-1",
        generalStockReceipt: {
          id: "general-1",
          entity_id: "entity-1",
          location_id: "location-1",
          style_name: "STYLE-1",
          size: "M",
          quantity_in: 10,
          quantity_out: 4,
          current_stock: 6,
        },
        bookingAllocations: [{
          id: "allocation-1",
          allocated_quantity: 4,
          finishedGoodsStockReceipt: {
            id: "allocated-1",
            entity_id: "entity-1",
            location_id: "location-1",
            style_name: "STYLE-1",
            size: "M",
            quantity_in: 4,
            quantity_out: 0,
            current_stock: 4,
          },
        }],
      }],
    }]);
    mocks.transaction.finishedGoodsOutwardRequestLine.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsAllocatedStockReceipt.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.workOrderInventoryGrnBookingAllocation.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsGeneralStockReceipt.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
      id: "outward-line-1",
      source_stock_type: "ALLOCATED",
      source_stock_id: "allocated-1",
      shipped_quantity: new Prisma.Decimal(0),
      boxLines: [{ id: "box-line-1" }],
    }]);

    const result = await deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["grn-1"]);

    expect(result).toEqual([{ id: "grn-1", grnNo: "FGRN-1" }]);
    expect(mocks.transaction.finishedGoodsStock.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        entity_id: "entity-1",
        location_id: "location-1",
        style_name: "STYLE-1",
        size: "M",
      },
      data: {
        quantity_on_hand: { decrement: new Prisma.Decimal(10) },
        quantity_reserved: { decrement: new Prisma.Decimal(4) },
      },
    });
    expect(mocks.transaction.finishedGoodsOutwardBoxLine.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", request_line_id: { in: ["outward-line-1"] } },
    });
    expect(mocks.transaction.finishedGoodsOutwardRequestLine.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["outward-line-1"] },
        shipped_quantity: 0,
      },
    });
    expect(mocks.transaction.finishedGoodsAllocatedStockReceipt.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["allocated-1"] } },
    });
    expect(mocks.transaction.workOrderInventoryGrnBookingAllocation.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["allocation-1"] } },
    });
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["general-1"] } },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        removed_general_stock_receipt_ids: ["general-1"],
        removed_allocated_stock_receipt_ids: ["allocated-1"],
        removed_booking_allocation_ids: ["allocation-1"],
        removed_outward_request_line_ids: ["outward-line-1"],
      }),
    }), mocks.transaction);
  });

  it.each([
    {
      label: "a linked POS sale",
      expectedIssue: {
        id: "invoice-1",
        type: "POS_INVOICE",
        documentNo: "POS-001",
      },
      configure: () => {
        mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([{
          ...structuredClone(emptyGrn),
          lines: [{
            id: "line-1",
            generalStockReceipt: {
              id: "general-1",
              entity_id: "entity-1",
              location_id: "location-1",
              style_name: "STYLE-1",
              size: "M",
              quantity_in: 10,
              quantity_out: 0,
              current_stock: 10,
            },
            bookingAllocations: [],
          }],
        }]);
        mocks.transaction.posSalesInvoiceLine.findMany.mockResolvedValue([{
          invoice: { id: "invoice-1", invoice_no: "POS-001" },
        }]);
      },
    },
    {
      label: "a shipped outward request",
      expectedIssue: {
        id: "request-1",
        type: "FG_OUTWARD_REQUEST",
        documentNo: "FG-OUT-001",
      },
      configure: () => {
        mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([{
          ...structuredClone(emptyGrn),
          lines: [{
            id: "line-1",
            generalStockReceipt: null,
            bookingAllocations: [{
              id: "allocation-1",
              allocated_quantity: 2,
              finishedGoodsStockReceipt: {
                id: "allocated-1",
                entity_id: "entity-1",
                location_id: "location-1",
                style_name: "STYLE-1",
                size: "M",
                quantity_in: 2,
                quantity_out: 0,
                current_stock: 2,
              },
            }],
          }],
        }]);
        mocks.transaction.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
          id: "outward-line-1",
          source_stock_type: "ALLOCATED",
          source_stock_id: "allocated-1",
          shipped_quantity: new Prisma.Decimal(1),
          request: { id: "request-1", request_no: "FG-OUT-001" },
        }]);
      },
    },
  ])("blocks deletion when $label has been issued", async ({ configure, expectedIssue }) => {
    configure();

    await expect(deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["grn-1"]))
      .rejects.toMatchObject({
        message: "This GRN cannot be deleted because material has already been issued against it.",
        issues: [expectedIssue],
      });

    expect(mocks.transaction.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.workOrderInventoryGrn.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("deletes unissued stock even when receipt quantities do not reconcile", async () => {
    mocks.transaction.workOrderInventoryGrnBookingAllocation.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsGeneralStockReceipt.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([{
      ...structuredClone(emptyGrn),
      status: "VERIFIED",
      lines: [{
        id: "line-1",
        generalStockReceipt: {
          id: "general-1",
          entity_id: "entity-1",
          location_id: "location-1",
          style_name: "STYLE-1",
          size: "M",
          quantity_in: 10,
          quantity_out: 5,
          current_stock: 5,
        },
        bookingAllocations: [{
          id: "allocation-1",
          allocated_quantity: 4,
          finishedGoodsStockReceipt: null,
        }],
      }],
    }]);

    await expect(deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["grn-1"]))
      .resolves.toEqual([{ id: "grn-1", grnNo: "FGRN-1" }]);

    expect(mocks.transaction.finishedGoodsStock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        quantity_on_hand: { decrement: new Prisma.Decimal(5) },
        quantity_reserved: { decrement: new Prisma.Decimal(0) },
      },
    }));
    expect(mocks.transaction.workOrderInventoryGrn.deleteMany).toHaveBeenCalled();
  });

  it("blocks deletion when the FG issue ledger references a GRN receipt", async () => {
    mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([{
      ...structuredClone(emptyGrn),
      lines: [{
        id: "line-1",
        generalStockReceipt: {
          id: "general-1",
          entity_id: "entity-1",
          location_id: "location-1",
          style_name: "STYLE-1",
          size: "M",
          quantity_in: 10,
          quantity_out: 0,
          current_stock: 10,
        },
        bookingAllocations: [],
      }],
    }]);
    mocks.transaction.fGMaterialIssueLine.findMany.mockResolvedValue([{
      general_receipt_id: "general-1",
      allocated_receipt_id: null,
      issue: {
        id: "issue-1",
        issue_no: "FG-ISS-0042",
        pos_invoice_id: "invoice-1",
        source_reference: "POS-0042",
      },
    }]);

    await expect(deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["grn-1"]))
      .rejects.toMatchObject({
        message: "This GRN cannot be deleted because material has already been issued against it.",
        issues: [{
          id: "invoice-1",
          type: "POS_INVOICE",
          documentNo: "POS-0042",
          issueNo: "FG-ISS-0042",
        }],
      });

    expect(mocks.transaction.fGMaterialIssueLine.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        OR: [{ general_receipt_id: { in: ["general-1"] } }],
      },
      select: {
        general_receipt_id: true,
        allocated_receipt_id: true,
        issue: {
          select: {
            id: true,
            issue_no: true,
            pos_invoice_id: true,
            source_reference: true,
          },
        },
      },
    });
    expect(mocks.transaction.workOrderInventoryGrn.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks deletion when an ID is absent from the authorized organization", async () => {
    mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([]);

    await expect(deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["foreign-grn"]))
      .rejects.toThrow("One or more selected Work Order GRNs were not found in this organization.");

    expect(mocks.transaction.workOrderInventoryGrn.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("rolls back when the selected GRN set changes during deletion", async () => {
    mocks.transaction.workOrderInventoryGrn.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["grn-1"]))
      .rejects.toThrow("One or more Work Order GRNs changed while being deleted.");

    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("deletes unissued GRNs when the stock summary is missing", async () => {
    mocks.transaction.workOrderInventoryGrn.findMany.mockResolvedValue([{
      ...structuredClone(emptyGrn),
      status: "VERIFIED",
      lines: [{
        id: "line-1",
        generalStockReceipt: {
          id: "general-1",
          entity_id: "entity-1",
          location_id: "location-1",
          style_name: "STYLE-1",
          size: "M",
          quantity_in: 10,
          quantity_out: 0,
          current_stock: 10,
        },
        bookingAllocations: [],
      }],
    }]);
    mocks.transaction.finishedGoodsStock.updateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.finishedGoodsGeneralStockReceipt.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteWorkOrderInventoryGrns("internal-org-1", "user-1", ["grn-1"]))
      .resolves.toEqual([{ id: "grn-1", grnNo: "FGRN-1" }]);

    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.deleteMany).toHaveBeenCalled();
    expect(mocks.transaction.workOrderInventoryGrn.deleteMany).toHaveBeenCalled();
  });
});
