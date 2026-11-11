import { FGMaterialIssueMovement, FGMaterialIssueSource, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoiceFindMany: vi.fn(),
  invoiceFindFirst: vi.fn(),
  returnFindFirst: vi.fn(),
  returnFindMany: vi.fn(),
  returnCreate: vi.fn(),
  returnLineFindMany: vi.fn(),
  returnLineCreateMany: vi.fn(),
  invoiceLineUpdateMany: vi.fn(),
  stockIssueFindFirst: vi.fn(),
  stockIssueLineFindMany: vi.fn(),
  skuStockFindMany: vi.fn(),
  skuStockUpdateMany: vi.fn(),
  receiptFindMany: vi.fn(),
  receiptUpdateMany: vi.fn(),
  finishedGoodsStockUpdateMany: vi.fn(),
  transaction: vi.fn(),
  createFgMaterialIssue: vi.fn(),
  createAuditEvent: vi.fn(),
  reserveDocumentNumber: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    posSalesInvoice: {
      findMany: mocks.invoiceFindMany,
      findFirst: mocks.invoiceFindFirst,
    },
    fGMaterialIssue: { findFirst: mocks.stockIssueFindFirst },
    posSalesReturn: {
      findFirst: mocks.returnFindFirst,
      findMany: mocks.returnFindMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/services/inventory/fg-issued-service", () => ({
  createFgMaterialIssue: mocks.createFgMaterialIssue,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveDocumentNumber,
}));

import {
  createPosSalesReturn,
  encodePosSalesReturnCursor,
  getPosSalesReturnInvoice,
  listAvailablePosSalesReturnCredits,
  markPosSalesReturnRefunded,
  parsePosSalesReturnCursor,
  searchPosSalesReturnInvoices,
} from "./pos-sales-return-service";

const d = (value: string | number) => new Prisma.Decimal(value);

function createInvoiceLine(stockType: "SKU" | "GENERAL_GRN" = "SKU") {
  return {
    id: "invoice-line-1",
    sku_stock_id: stockType === "SKU" ? "sku-1" : null,
    general_stock_receipt_id: stockType === "GENERAL_GRN" ? "receipt-1" : null,
    style_name: "CLASSIC SHIRT",
    order_no: "WO-001",
    article_no: "ART-001",
    size: "M",
    colour: "BLUE",
    quantity: 2,
    returned_quantity: 0,
    unit_rate: d(100),
    gst_rate: d(5),
    discount_percent: d(0),
    taxable_amount: d(200),
    cgst_amount: d(5),
    sgst_amount: d(5),
    igst_amount: d(0),
    total_amount: d(210),
  };
}

function createInvoice(stockType: "SKU" | "GENERAL_GRN" = "SKU") {
  return {
    id: "invoice-1",
    invoice_no: "POS-0001",
    invoice_date: new Date("2026-10-10T00:00:00.000Z"),
    customer: "CUSTOMER",
    customer_contact_id: "contact-1",
    customer_contact: { phone: "9876543210" },
    entity: { entity_name: "MAIN STORE" },
    status: "POSTED",
    subtotal: d(200),
    cgst_amount: d(5),
    sgst_amount: d(5),
    igst_amount: d(0),
    tax_amount: d(10),
    total_amount: d(210),
    posted_at: new Date("2026-10-10T10:00:00.000Z"),
    lines: [createInvoiceLine(stockType)],
  };
}

function setupTransaction(stockType: "SKU" | "GENERAL_GRN" = "SKU") {
  const invoice = createInvoice(stockType);
  const transaction = {
    posSalesReturn: {
      findFirst: mocks.returnFindFirst,
      create: mocks.returnCreate,
    },
    posSalesInvoice: { findFirst: mocks.invoiceFindFirst },
    fGMaterialIssue: { findFirst: mocks.stockIssueFindFirst },
    fGMaterialIssueLine: { findMany: mocks.stockIssueLineFindMany },
    posSalesReturnLine: {
      findMany: mocks.returnLineFindMany,
      createMany: mocks.returnLineCreateMany,
    },
    posSalesInvoiceLine: { updateMany: mocks.invoiceLineUpdateMany },
    finishedGoodsSkuStock: {
      findMany: mocks.skuStockFindMany,
      updateMany: mocks.skuStockUpdateMany,
    },
    finishedGoodsGeneralStockReceipt: {
      findMany: mocks.receiptFindMany,
      updateMany: mocks.receiptUpdateMany,
    },
    finishedGoodsStock: { updateMany: mocks.finishedGoodsStockUpdateMany },
    auditEvent: { create: vi.fn() },
    procurementDocumentCounter: { upsert: vi.fn() },
  };
  mocks.transaction.mockImplementation(async (callback: (database: typeof transaction) => Promise<unknown>) =>
    callback(transaction),
  );
  mocks.returnFindFirst.mockResolvedValue(null);
  mocks.invoiceFindFirst.mockResolvedValue(invoice);
  mocks.stockIssueFindFirst.mockResolvedValue({
    id: "issue-1",
    lines: [{
      id: "issue-line-1",
      pos_invoice_line_id: "invoice-line-1",
      stock_type: stockType === "SKU" ? "SKU" : "GENERAL",
      sku_stock_id: stockType === "SKU" ? "sku-1" : null,
      general_receipt_id: stockType === "GENERAL_GRN" ? "receipt-1" : null,
      item_code: "SKU-1",
      style_name: "CLASSIC SHIRT",
      article_no: "ART-001",
      size: "M",
      colour: "BLUE",
      quantity: d(2),
    }],
  });
  mocks.returnLineFindMany.mockResolvedValue([]);
  mocks.invoiceLineUpdateMany.mockResolvedValue({ count: 1 });
  mocks.skuStockFindMany.mockResolvedValue(
    stockType === "SKU" ? [{ id: "sku-1", current_stock: d(3), qty_out: d(2) }] : [],
  );
  mocks.skuStockUpdateMany.mockResolvedValue({ count: 1 });
  mocks.receiptFindMany.mockResolvedValue(
    stockType === "GENERAL_GRN"
      ? [{
          id: "receipt-1",
          entity_id: "entity-1",
          location_id: "location-1",
          style_name: "CLASSIC SHIRT",
          size: "M",
          current_stock: 3,
          quantity_out: 2,
        }]
      : [],
  );
  mocks.receiptUpdateMany.mockResolvedValue({ count: 1 });
  mocks.finishedGoodsStockUpdateMany.mockResolvedValue({ count: 1 });
  mocks.returnCreate.mockResolvedValue({ id: "return-1" });
  mocks.stockIssueLineFindMany.mockResolvedValue([
    { id: "reversal-line-1", reversal_of_line_id: "issue-line-1" },
  ]);
  mocks.returnLineCreateMany.mockResolvedValue({ count: 1 });
  mocks.createFgMaterialIssue.mockResolvedValue({ id: "reversal-issue-1", issue_no: "FG-ISS-2" });
  mocks.reserveDocumentNumber.mockResolvedValue("SR-1");
  return { invoice, transaction };
}

describe("POS sales return service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches only the authorized organization's posted invoices by invoice, customer, or mobile", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    await searchPosSalesReturnInvoices({
      organizationId: "internal-org-1",
      search: "98765",
      take: 25,
    });

    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        status: "POSTED",
        OR: expect.arrayContaining([
          { invoice_no: { contains: "98765", mode: "insensitive" } },
          { customer: { contains: "98765", mode: "insensitive" } },
          { customer_contact: { is: { phone: { contains: "98765", mode: "insensitive" } } } },
        ]),
      }),
      take: 26,
    }));
  });

  it("uses validated cursors for stable invoice pagination", () => {
    const cursor = { id: "invoice-1", postedAt: new Date("2026-10-10T10:00:00.000Z") };
    expect(parsePosSalesReturnCursor(encodePosSalesReturnCursor(cursor))).toEqual(cursor);
    expect(parsePosSalesReturnCursor("not-a-cursor")).toBeNull();
  });

  it("returns an invoice with remaining quantities scoped to the organization", async () => {
    const invoice = createInvoice();
    mocks.invoiceFindFirst.mockResolvedValue(invoice);
    mocks.stockIssueFindFirst.mockResolvedValue({
      lines: [{ pos_invoice_line_id: "invoice-line-1" }],
    });
    const result = await getPosSalesReturnInvoice("internal-org-1", "POS-0001");

    expect(mocks.invoiceFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        invoice_no: "POS-0001",
        status: "POSTED",
      },
    }));
    expect(result?.lines[0]).toMatchObject({
      quantity: 2,
      returnedQuantity: 0,
      returnableQuantity: 2,
      totalAmount: "210.00",
    });
  });

  it("posts a partial SKU return with prorated credit and a linked stock reversal", async () => {
    setupTransaction();
    const result = await createPosSalesReturn({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-0001",
      requestKey: "return-request-1",
      reason: "Wrong size",
      settlementType: "STORE_CREDIT",
      lines: [{ invoiceLineId: "invoice-line-1", quantity: 1 }],
    });

    expect(result).toEqual({ id: "return-1", returnNumber: "SR-1", duplicate: false });
    expect(mocks.invoiceLineUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        returned_quantity: { lte: 1 },
      }),
      data: { returned_quantity: { increment: 1 } },
    }));
    expect(mocks.skuStockUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sku-1", organization_id: "internal-org-1", qty_out: { gte: 1 } },
      data: { current_stock: { increment: 1 }, qty_out: { decrement: 1 } },
    }));
    expect(mocks.createFgMaterialIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceType: FGMaterialIssueSource.POS_INVOICE,
        movement: FGMaterialIssueMovement.REVERSAL,
        posInvoiceId: "invoice-1",
        reversalOfId: "issue-1",
        idempotencyKey: "pos-sales-return:return-1:reversal",
      }),
    );
    expect(mocks.returnLineCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        return_id: "return-1",
        invoice_id: "invoice-1",
        invoice_line_id: "invoice-line-1",
        stock_issue_line_id: "reversal-line-1",
        quantity: 1,
        taxable_amount: d(100),
        cgst_amount: d(2.5),
        sgst_amount: d(2.5),
        total_amount: d(105),
      })],
    });
    expect(mocks.returnCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settlement_type: "STORE_CREDIT",
        refund_method: null,
        refund_status: null,
        store_credit_balance_amount: d(105),
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "POST_SALES_RETURN", entityId: "return-1" }),
      expect.anything(),
    );
  });

  it("restores general receipt and aggregate balances in the same posting", async () => {
    setupTransaction("GENERAL_GRN");
    await createPosSalesReturn({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-0001",
      requestKey: "return-request-general",
      reason: "Damaged item",
      settlementType: "STORE_CREDIT",
      lines: [{ invoiceLineId: "invoice-line-1", quantity: 1 }],
    });

    expect(mocks.receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "receipt-1", organization_id: "internal-org-1", quantity_out: { gte: 1 } },
      data: { current_stock: { increment: 1 }, quantity_out: { decrement: 1 } },
    }));
    expect(mocks.finishedGoodsStockUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        location_id: "location-1",
        style_name: "CLASSIC SHIRT",
        size: "M",
        quantity_issued: { gte: 1 },
      },
      data: { quantity_on_hand: { increment: 1 }, quantity_issued: { decrement: 1 } },
    }));
  });

  it("rejects a return that exceeds the unreturned invoice quantity", async () => {
    const { invoice } = setupTransaction();
    invoice.lines[0].returned_quantity = 2;
    await expect(createPosSalesReturn({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-0001",
      requestKey: "return-request-overage",
      reason: "Customer return",
      settlementType: "STORE_CREDIT",
      lines: [{ invoiceLineId: "invoice-line-1", quantity: 1 }],
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.skuStockUpdateMany).not.toHaveBeenCalled();
    expect(mocks.createFgMaterialIssue).not.toHaveBeenCalled();
  });

  it("makes same-key retries idempotent and rejects a different payload", async () => {
    setupTransaction();
    mocks.returnFindFirst.mockResolvedValue({
      id: "return-1",
      return_no: "SR-1",
      reason: "WRONG SIZE",
      settlement_type: "STORE_CREDIT",
      refund_method: null,
      invoice: { invoice_no: "POS-0001" },
      lines: [{ invoice_line_id: "invoice-line-1", quantity: 1 }],
    });
    const result = await createPosSalesReturn({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-0001",
      requestKey: "return-request-1",
      reason: "Wrong size",
      settlementType: "STORE_CREDIT",
      lines: [{ invoiceLineId: "invoice-line-1", quantity: 1 }],
    });
    expect(result).toEqual({ id: "return-1", returnNumber: "SR-1", duplicate: true });
    expect(mocks.skuStockUpdateMany).not.toHaveBeenCalled();

    await expect(createPosSalesReturn({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-0001",
      requestKey: "return-request-1",
      reason: "Wrong size",
      settlementType: "STORE_CREDIT",
      lines: [{ invoiceLineId: "invoice-line-1", quantity: 2 }],
    })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects invoices without an original posted inventory issue", async () => {
    setupTransaction();
    mocks.stockIssueFindFirst.mockResolvedValue(null);

    await expect(createPosSalesReturn({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-0001",
      requestKey: "return-no-issue",
      reason: "Customer return",
      settlementType: "STORE_CREDIT",
      lines: [{ invoiceLineId: "invoice-line-1", quantity: 1 }],
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.skuStockUpdateMany).not.toHaveBeenCalled();
  });

  it("records a refund as pending with its selected payment method", async () => {
    setupTransaction();
    await createPosSalesReturn({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-0001",
      requestKey: "return-refund",
      reason: "Customer return",
      settlementType: "REFUND",
      refundMethod: "UPI",
      lines: [{ invoiceLineId: "invoice-line-1", quantity: 1 }],
    });

    expect(mocks.returnCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settlement_type: "REFUND",
        refund_method: "UPI",
        refund_status: "PENDING",
        store_credit_balance_amount: d(0),
      }),
    }));
  });

  it("lists available credits scoped to customer and organization", async () => {
    mocks.returnFindMany.mockResolvedValue([{
      id: "return-1",
      return_no: "SR-1",
      return_date: new Date("2026-10-10T00:00:00.000Z"),
      store_credit_balance_amount: d(25),
      invoice: { invoice_no: "POS-1" },
    }]);

    const credits = await listAvailablePosSalesReturnCredits("internal-org-1", "contact-1");

    expect(mocks.returnFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        settlement_type: "STORE_CREDIT",
        invoice: { is: { organization_id: "internal-org-1", customer_contact_id: "contact-1" } },
      }),
      take: 50,
    }));
    expect(credits).toEqual([expect.objectContaining({
      id: "return-1",
      availableAmount: "25.00",
    })]);
  });

  it("marks a pending refund paid exactly once and audits the actor", async () => {
    const tx = {
      posSalesReturn: {
        findFirst: vi.fn().mockResolvedValue({
          id: "return-1",
          settlement_type: "REFUND",
          refund_method: "UPI",
          refund_status: "PENDING",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mocks.transaction.mockImplementationOnce(async (callback: (database: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(markPosSalesReturnRefunded({
      organizationId: "internal-org-1",
      actorId: "finance-user",
      returnNumber: "SR-1",
      reference: "upi-ref-123",
    })).resolves.toEqual({ duplicate: false });

    expect(tx.posSalesReturn.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "return-1",
        organization_id: "internal-org-1",
        settlement_type: "REFUND",
        refund_status: "PENDING",
      },
      data: expect.objectContaining({
        refund_status: "REFUNDED",
        refund_reference: "UPI-REF-123",
        refunded_by: "finance-user",
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "SETTLE_SALES_RETURN_REFUND",
      entityId: "return-1",
    }), tx);
  });
});
