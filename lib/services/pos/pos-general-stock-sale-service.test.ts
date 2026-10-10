import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: {
    finishedGoodsGeneralStockReceipt: { findMany: vi.fn(), updateMany: vi.fn() },
    finishedGoodsStock: { updateMany: vi.fn() },
    masterGst: { findMany: vi.fn() },
    posSalesInvoice: { findFirst: vi.fn(), create: vi.fn() },
    posSalesInvoiceLine: { createMany: vi.fn() },
  },
  prismaTransaction: vi.fn(),
  reserveNumber: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.prismaTransaction },
}));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveNumber,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import { createPosGeneralStockSale } from "./pos-general-stock-sale-service";

const stockRecord = {
  id: "general-stock-1",
  style_name: "Classic Shirt",
  order_no: "ORDER-1",
  article_no: "ARTICLE-1",
  size: "M",
  colour: "Navy",
  location_id: "location-1",
  current_stock: 8,
};

const saleInput = {
  organizationId: "organization-1",
  actorId: "user-1",
  requestKey: "sale-request-1",
  invoiceDate: "2026-10-07",
  customer: "Walk-in",
  taxMode: "LOCAL" as const,
  lines: [{
    stockId: "general-stock-1",
    quantity: "2",
    rate: "100.00",
    gstRate: "5",
    discountPercent: "10",
    hsnCode: "6105",
  }],
};

describe("createPosGeneralStockSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaTransaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([stockRecord]);
    mocks.transaction.masterGst.findMany.mockResolvedValue([{
      gst: new Prisma.Decimal("5"),
      cgst_rate: new Prisma.Decimal("2.5"),
      sgst_rate: new Prisma.Decimal("2.5"),
      igst_rate: new Prisma.Decimal("5"),
    }]);
    mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.posSalesInvoice.findFirst.mockResolvedValue(null);
    mocks.transaction.posSalesInvoice.create.mockResolvedValue({ id: "invoice-1" });
    mocks.transaction.posSalesInvoiceLine.createMany.mockResolvedValue({ count: 1 });
    mocks.reserveNumber.mockResolvedValue("POS-1");
  });

  it("posts against General GRN stock, updates balances, and audits", async () => {
    const result = await createPosGeneralStockSale(saleInput);

    expect(result).toMatchObject({
      invoiceNo: "POS-1",
      subtotal: "180.00",
      cgstAmount: "4.50",
      sgstAmount: "4.50",
      totalAmount: "189.00",
    });
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenCalledWith({
      where: {
        id: "general-stock-1",
        organization_id: "organization-1",
        current_stock: { gte: 2 },
      },
      data: { current_stock: { decrement: 2 }, quantity_out: { increment: 2 } },
    });
    expect(mocks.transaction.finishedGoodsStock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "organization-1", location_id: "location-1" }),
      data: {
        quantity_on_hand: { decrement: 2 },
        quantity_issued: { increment: 2 },
      },
    }));
    expect(mocks.transaction.posSalesInvoiceLine.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        organization_id: "organization-1",
        invoice_id: "invoice-1",
        general_stock_receipt_id: "general-stock-1",
        quantity: 2,
        taxable_amount: new Prisma.Decimal("180.00"),
      })],
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      module: "POS",
      action: "POST_GENERAL_FG_SALE",
      entityId: "invoice-1",
    }), mocks.transaction);
  });

  it("rejects quantity above General stock without posting", async () => {
    await expect(createPosGeneralStockSale({
      ...saleInput,
      lines: [{ ...saleInput.lines[0], quantity: "9" }],
    })).rejects.toThrow("has only 8 General units available");

    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("rejects stock IDs not found in General receipts", async () => {
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);

    await expect(createPosGeneralStockSale(saleInput)).rejects.toThrow(
      "not General stock in this organization",
    );
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("rejects inactive or unconfigured GST rates", async () => {
    mocks.transaction.masterGst.findMany.mockResolvedValue([]);

    await expect(createPosGeneralStockSale(saleInput)).rejects.toThrow(
      "GST 5.00% is not configured as active",
    );
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
  });

  it("rejects fractional quantities for integer GRN stock", async () => {
    await expect(createPosGeneralStockSale({
      ...saleInput,
      lines: [{ ...saleInput.lines[0], quantity: "1.5" }],
    })).rejects.toThrow("Quantity must be a valid non-negative number");

    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("returns the existing invoice for a repeated request key", async () => {
    mocks.transaction.posSalesInvoice.findFirst.mockResolvedValue({
      id: "invoice-1",
      invoice_no: "POS-1",
      invoice_date: new Date("2026-10-07T00:00:00Z"),
      customer: "Walk-in",
      tax_mode: "LOCAL",
      subtotal: new Prisma.Decimal("180.00"),
      cgst_amount: new Prisma.Decimal("4.50"),
      sgst_amount: new Prisma.Decimal("4.50"),
      igst_amount: new Prisma.Decimal("0.00"),
      tax_amount: new Prisma.Decimal("9.00"),
      total_amount: new Prisma.Decimal("189.00"),
    });

    const result = await createPosGeneralStockSale(saleInput);

    expect(result.invoiceNo).toBe("POS-1");
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
  });

  it("rolls back when a concurrent sale consumes stock first", async () => {
    mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany.mockResolvedValue({ count: 0 });

    await expect(createPosGeneralStockSale(saleInput)).rejects.toThrow("no longer has enough General stock");
    expect(mocks.transaction.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.posSalesInvoiceLine.createMany).not.toHaveBeenCalled();
  });
});
