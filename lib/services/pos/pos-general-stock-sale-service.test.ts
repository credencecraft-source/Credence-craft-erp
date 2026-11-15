import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: {
    contact: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
    masterEntity: { findFirst: vi.fn() },
    masterHsn: { findMany: vi.fn() },
    finishedGoodsGeneralStockReceipt: { findMany: vi.fn(), updateMany: vi.fn() },
    finishedGoodsSkuStock: { findMany: vi.fn(), updateMany: vi.fn() },
    finishedGoodsStock: { updateMany: vi.fn() },
    masterGst: { findMany: vi.fn() },
    posOffer: { findMany: vi.fn() },
    posCoupon: { findFirst: vi.fn() },
    posCouponIssue: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    posCouponRedemption: { count: vi.fn(), create: vi.fn() },
    posSalesInvoice: { findFirst: vi.fn(), create: vi.fn() },
    posSalesReturn: { findMany: vi.fn(), updateMany: vi.fn() },
    posSalesReturnCreditApplication: { create: vi.fn() },
    posSalesInvoiceLine: { createManyAndReturn: vi.fn() },
  },
  prismaTransaction: vi.fn(),
  rewardCampaignFindFirst: vi.fn(),
  rewardRedemptionCount: vi.fn(),
  reserveNumber: vi.fn(),
  createAuditEvent: vi.fn(),
  createFgMaterialIssue: vi.fn(),
  resolveActivePosStockLocation: vi.fn(),
  ingestPosSale: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    posCoupon: { findFirst: mocks.rewardCampaignFindFirst },
    posCouponRedemption: { count: mocks.rewardRedemptionCount },
  },
}));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveNumber,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));
vi.mock("@/lib/services/inventory/fg-issued-service", () => ({
  createFgMaterialIssue: mocks.createFgMaterialIssue,
}));
vi.mock("@/lib/services/pos/pos-stock-location-service", () => ({
  resolveActivePosStockLocation: mocks.resolveActivePosStockLocation,
}));
vi.mock("@/lib/services/finance/finance-ingestion-service", () => ({
  ingestPosSale: mocks.ingestPosSale,
}));

import {
  createPosGeneralStockSale,
  isPosPurchaseRewardAvailable,
} from "./pos-general-stock-sale-service";

const stockRecord = {
  id: "general-stock-1",
  entity_id: "entity-1",
  style_name: "Classic Shirt",
  order_no: "ORDER-1",
  article_no: "ARTICLE-1",
  size: "M",
  colour: "Navy",
  product_category: "Dresses",
  sub_product_category: "Party Wear",
  location_id: "location-1",
  storage_node_id: "leaf-1",
  current_stock: 8,
};

const saleInput = {
  organizationId: "organization-1",
  actorId: "user-1",
  requestKey: "sale-request-1",
  entityId: "entity-1",
  stockHierarchy: {
    entityId: "entity-1",
    divisionId: "division-1",
    locationId: "location-1",
    subLocationId: "sub-location-1",
    subSubLocationId: "leaf-1",
  },
  invoiceDate: "2026-10-07",
  customerContactId: "customer-1",
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
    mocks.rewardCampaignFindFirst.mockResolvedValue(null);
    mocks.rewardRedemptionCount.mockResolvedValue(0);
    mocks.prismaTransaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([stockRecord]);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([]);
    mocks.transaction.masterGst.findMany.mockResolvedValue([{
      gst: new Prisma.Decimal("5"),
      cgst_rate: new Prisma.Decimal("2.5"),
      sgst_rate: new Prisma.Decimal("2.5"),
      igst_rate: new Prisma.Decimal("5"),
    }]);
    mocks.transaction.masterHsn.findMany.mockResolvedValue([{ hsn_code: "6105" }]);
    mocks.transaction.posOffer.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsSkuStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.finishedGoodsStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.masterEntity.findFirst.mockResolvedValue({ id: "entity-1", entity_name: "Store A" });
    mocks.resolveActivePosStockLocation.mockResolvedValue({
      entityId: "entity-1",
      divisionId: "division-1",
      locationId: "location-1",
      subLocationId: "sub-location-1",
      subSubLocationId: "leaf-1",
    });
    mocks.transaction.organization.findFirst.mockResolvedValue({ state: "Karnataka" });
    mocks.transaction.posCoupon.findFirst.mockResolvedValue(null);
    mocks.transaction.posCouponIssue.findFirst.mockResolvedValue(null);
    mocks.transaction.posCouponRedemption.count.mockResolvedValue(0);
    mocks.transaction.posCouponIssue.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.posCouponRedemption.create.mockResolvedValue({ id: "redemption-1" });
    mocks.transaction.posSalesInvoice.findFirst.mockResolvedValue(null);
    mocks.transaction.posSalesReturn.findMany.mockResolvedValue([]);
    mocks.transaction.posSalesReturn.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.posSalesReturnCreditApplication.create.mockResolvedValue({ id: "return-credit-application-1" });
    mocks.transaction.contact.findFirst.mockResolvedValue({
      id: "customer-1",
      legal_name: "Customer One",
      display_name: "Customer One",
      tax_registrations: [],
    });
    mocks.transaction.posSalesInvoice.create.mockResolvedValue({ id: "invoice-1" });
    mocks.transaction.posSalesInvoiceLine.createManyAndReturn.mockImplementation(
      ({ data }: { data: Record<string, unknown>[] }) => Promise.resolve(
        data.map((line, index) => ({ ...line, id: `invoice-line-${index + 1}` })),
      ),
    );
    mocks.ingestPosSale.mockResolvedValue({ id: "central-transaction-1", duplicate: false });
    mocks.reserveNumber.mockResolvedValue("POS-1");
  });

  it("applies same-customer return credit atomically without changing invoice value", async () => {
    mocks.transaction.posSalesReturn.findMany.mockResolvedValue([{
      id: "return-1",
      store_credit_balance_amount: new Prisma.Decimal("60.00"),
    }]);

    const result = await createPosGeneralStockSale({
      ...saleInput,
      customerContactId: "customer-1",
      returnCreditApplications: [{ returnId: "return-1", amount: "50.00" }],
    });

    expect(result).toMatchObject({
      totalAmount: "189.00",
      storeCreditAppliedAmount: "50.00",
      amountDue: "139.00",
    });
    expect(mocks.transaction.posSalesInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entity_name_snapshot: "Store A",
        total_amount: new Prisma.Decimal("189.00"),
        store_credit_applied_amount: new Prisma.Decimal("50.00"),
      }),
    }));
    expect(mocks.transaction.posSalesReturn.updateMany).toHaveBeenCalledWith({
      where: {
        id: "return-1",
        organization_id: "organization-1",
        settlement_type: "STORE_CREDIT",
        store_credit_balance_amount: { gte: new Prisma.Decimal("50.00") },
      },
      data: { store_credit_balance_amount: { decrement: new Prisma.Decimal("50.00") } },
    });
    expect(mocks.transaction.posSalesReturnCreditApplication.create).toHaveBeenCalledWith({
      data: {
        organization_id: "organization-1",
        return_id: "return-1",
        invoice_id: "invoice-1",
        amount: new Prisma.Decimal("50.00"),
        applied_by: "user-1",
      },
    });
  });

  it("rejects return credit that does not belong to the selected customer", async () => {
    await expect(createPosGeneralStockSale({
      ...saleInput,
      customerContactId: "customer-1",
      returnCreditApplications: [{ returnId: "other-customer-return", amount: "10.00" }],
    })).rejects.toThrow("unavailable, belongs to another customer");

    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
    expect(mocks.transaction.posSalesReturnCreditApplication.create).not.toHaveBeenCalled();
  });

  it("reports an active purchase reward when the selected items meet its threshold", async () => {
    mocks.rewardCampaignFindFirst.mockResolvedValue({
      id: "reward-campaign-1",
      max_redemptions: 10,
    });

    await expect(isPosPurchaseRewardAvailable({
      organizationId: "organization-1",
      invoiceDate: "2026-11-07",
      subtotal: "1000.00",
    })).resolves.toBe(true);

    expect(mocks.rewardCampaignFindFirst).toHaveBeenCalledWith({
      where: {
        organization_id: "organization-1",
        coupon_type: "PURCHASE_REWARD",
        status: "ACTIVE",
        starts_at: { lte: new Date("2026-11-07T00:00:00.000Z") },
        minimum_purchase: { lte: new Prisma.Decimal("1000.00") },
        OR: [
          { ends_at: null },
          { ends_at: { gte: new Date("2026-11-07T00:00:00.000Z") } },
        ],
      },
      select: { id: true, max_redemptions: true },
    });
  });

  it("does not report a reward after the campaign redemption cap is reached", async () => {
    mocks.rewardCampaignFindFirst.mockResolvedValue({
      id: "reward-campaign-1",
      max_redemptions: 2,
    });
    mocks.rewardRedemptionCount.mockResolvedValue(2);

    await expect(isPosPurchaseRewardAvailable({
      organizationId: "organization-1",
      invoiceDate: "2026-11-07",
      subtotal: "1000.00",
    })).resolves.toBe(false);
  });

  it("posts against General GRN stock, updates balances, and audits", async () => {
    const result = await createPosGeneralStockSale(saleInput);

    expect(mocks.prismaTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
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
        storage_node_id: "leaf-1",
        current_stock: { gte: 2 },
      },
      data: { current_stock: { decrement: 2 }, quantity_out: { increment: 2 } },
    });
    expect(mocks.resolveActivePosStockLocation).toHaveBeenCalledWith(
      mocks.transaction,
      "organization-1",
      saleInput.stockHierarchy,
    );
    expect(mocks.transaction.finishedGoodsStock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "organization-1", location_id: "location-1" }),
      data: {
        quantity_on_hand: { decrement: 2 },
        quantity_issued: { increment: 2 },
      },
    }));
    expect(mocks.transaction.posSalesInvoiceLine.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        organization_id: "organization-1",
        invoice_id: "invoice-1",
        general_stock_receipt_id: "general-stock-1",
        sku_stock_id: null,
        quantity: 2,
        taxable_amount: new Prisma.Decimal("180.00"),
      })],
      select: {
        id: true,
        general_stock_receipt_id: true,
        sku_stock_id: true,
        style_name: true,
        article_no: true,
        size: true,
        quantity: true,
        unit_rate: true,
        offer_discount_amount: true,
        hsn_code: true,
        gst_rate: true,
        taxable_amount: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        total_amount: true,
      },
    });

    expect(mocks.createFgMaterialIssue).toHaveBeenCalledWith(mocks.transaction, expect.objectContaining({
      organizationId: "organization-1",
      sourceType: "POS_INVOICE",
      movement: "ISSUE",
      posInvoiceId: "invoice-1",
      sourceReference: "POS-1",
      lines: [expect.objectContaining({
        generalReceiptId: "general-stock-1",
        posInvoiceLineId: "invoice-line-1",
        quantity: new Prisma.Decimal(2),
        uomCode: "PCS",
        stockBefore: new Prisma.Decimal(8),
        stockAfter: new Prisma.Decimal(6),
      })],
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      module: "POS",
      action: "POST_GENERAL_FG_SALE",
      entityId: "invoice-1",
    }), mocks.transaction);
    expect(mocks.ingestPosSale).toHaveBeenCalledWith(mocks.transaction, expect.objectContaining({
      organizationId: "organization-1",
      sourceId: "invoice-1",
      sourceDocumentNumber: "POS-1",
      totalAmount: new Prisma.Decimal("189.00"),
      lines: [expect.objectContaining({
        sourceLineId: "invoice-line-1",
        hsnCode: "6105",
        gstRate: new Prisma.Decimal("5"),
      })],
    }));
  });

  it("does not post stock whose verified leaf differs from the selected issue location", async () => {
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([
      { ...stockRecord, storage_node_id: null },
    ]);

    await expect(createPosGeneralStockSale(saleInput))
      .rejects.toThrow("available at the selected Sub-sub-location");
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive or foreign hierarchy before reading or deducting stock", async () => {
    mocks.resolveActivePosStockLocation.mockRejectedValue(new Error("Select an active Sub-sub-location."));

    await expect(createPosGeneralStockSale(saleInput))
      .rejects.toThrow("Select an active Sub-sub-location");

    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsSkuStock.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("links an invoice to an active tenant customer contact", async () => {
    mocks.transaction.contact.findFirst.mockResolvedValue({
      id: "customer-contact-1",
      legal_name: "Acme Retail",
      display_name: "ACME RETAIL",
      tax_registrations: [],
    });

    const result = await createPosGeneralStockSale({
      ...saleInput,
      customer: "Untrusted submitted name",
      customerContactId: "customer-contact-1",
    });

    expect(mocks.transaction.contact.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: "organization-1",
        id: "customer-contact-1",
        is_active: true,
        roles: { some: { role_code: "CUSTOMER", is_active: true } },
      },
      select: {
        id: true,
        legal_name: true,
        display_name: true,
        tax_registrations: {
          where: { status: "ACTIVE" },
          select: { gstin: true },
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
    });
    expect(mocks.transaction.posSalesInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "organization-1",
        customer: "ACME RETAIL",
        customer_contact_id: "customer-contact-1",
      }),
    }));
    expect(result.customer).toBe("ACME RETAIL");
  });

  it("rejects inactive, cross-organization, or non-customer contacts before stock changes", async () => {
    mocks.transaction.contact.findFirst.mockResolvedValue(null);

    await expect(createPosGeneralStockSale({
      ...saleInput,
      customerContactId: "other-contact",
    })).rejects.toThrow("Select an active contact with the Customer role.");

    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("rejects counter invoices without a registered customer", async () => {
    await expect(createPosGeneralStockSale({
      ...saleInput,
      customerContactId: null,
    })).rejects.toThrow("Select a registered customer before posting a POS invoice.");

    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("rejects quantity above General stock without posting", async () => {
    await expect(createPosGeneralStockSale({
      ...saleInput,
      lines: [{ ...saleInput.lines[0], quantity: "9" }],
    })).rejects.toThrow("has only 8 General units available");

    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("rejects stock that belongs to a different Entity", async () => {
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([
      { ...stockRecord, entity_id: "entity-other" },
    ]);

    await expect(createPosGeneralStockSale(saleInput)).rejects.toThrow(
      "Every selected stock item must belong to the selected Entity.",
    );
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
    expect(mocks.transaction.finishedGoodsGeneralStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("applies general coupon discount before calculating tax and records redemption", async () => {
    mocks.transaction.posCoupon.findFirst.mockResolvedValueOnce({
      id: "coupon-1",
      coupon_code: "SAVE10",
      coupon_type: "GENERAL",
      status: "ACTIVE",
      discount_type: "PERCENTAGE",
      discount_value: new Prisma.Decimal("10"),
      minimum_purchase: new Prisma.Decimal("100"),
      starts_at: new Date("2026-10-01T00:00:00.000Z"),
      ends_at: null,
      max_redemptions: null,
    });

    const result = await createPosGeneralStockSale({ ...saleInput, couponCode: "save10" });

    expect(result).toMatchObject({
      subtotal: "162.00",
      cgstAmount: "4.05",
      sgstAmount: "4.05",
      totalAmount: "170.10",
      couponDiscountAmount: "18.00",
      appliedCouponCode: "SAVE10",
    });
    expect(mocks.transaction.posSalesInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ coupon_discount_amount: new Prisma.Decimal("18.00") }),
    }));
    expect(mocks.transaction.posSalesInvoiceLine.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ taxable_amount: new Prisma.Decimal("162.00") })],
    }));
    expect(mocks.transaction.posCouponRedemption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "organization-1",
        coupon_id: "coupon-1",
        invoice_id: "invoice-1",
        coupon_code: "SAVE10",
        discount_amount: new Prisma.Decimal("18.00"),
      }),
    });
  });

  it("rejects expired general coupons before creating an invoice", async () => {
    mocks.transaction.posCoupon.findFirst.mockResolvedValueOnce({
      id: "coupon-1",
      coupon_code: "SAVE10",
      coupon_type: "GENERAL",
      status: "ACTIVE",
      discount_type: "FLAT_AMOUNT",
      discount_value: new Prisma.Decimal("10"),
      minimum_purchase: new Prisma.Decimal("0"),
      starts_at: new Date("2026-09-01T00:00:00.000Z"),
      ends_at: new Date("2026-10-01T00:00:00.000Z"),
      max_redemptions: null,
    });

    await expect(createPosGeneralStockSale({ ...saleInput, couponCode: "SAVE10" })).rejects.toThrow(
      "This coupon is not active on the invoice date.",
    );
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
  });

  it("enforces general coupon redemption limits", async () => {
    mocks.transaction.posCoupon.findFirst.mockResolvedValueOnce({
      id: "coupon-1",
      coupon_code: "SAVE10",
      coupon_type: "GENERAL",
      status: "ACTIVE",
      discount_type: "FLAT_AMOUNT",
      discount_value: new Prisma.Decimal("10"),
      minimum_purchase: new Prisma.Decimal("0"),
      starts_at: new Date("2026-09-01T00:00:00.000Z"),
      ends_at: null,
      max_redemptions: 1,
    });
    mocks.transaction.posCouponRedemption.count.mockResolvedValue(1);

    await expect(createPosGeneralStockSale({ ...saleInput, couponCode: "SAVE10" })).rejects.toThrow(
      "This coupon campaign has reached its redemption limit.",
    );
    expect(mocks.transaction.posCouponRedemption.count).toHaveBeenCalledWith({
      where: { organization_id: "organization-1", coupon_id: "coupon-1" },
    });
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
  });

  it("issues a customer-bound reward after a qualifying sale", async () => {
    mocks.transaction.contact.findFirst.mockResolvedValue({
      id: "customer-contact-1",
      legal_name: "Acme Retail",
      display_name: "ACME RETAIL",
      tax_registrations: [],
    });
    mocks.transaction.posCoupon.findFirst.mockResolvedValueOnce({
      id: "reward-campaign-1",
      discount_value: new Prisma.Decimal("10"),
      validity_days: 30,
      max_redemptions: null,
    });

    const result = await createPosGeneralStockSale({
      ...saleInput,
      customerContactId: "customer-contact-1",
    });

    expect(result.issuedCouponCode).toMatch(/^CC-[A-F0-9]{16}$/);
    expect(mocks.transaction.posCouponIssue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "organization-1",
        coupon_id: "reward-campaign-1",
        customer_contact_id: "customer-contact-1",
        issued_invoice_id: "invoice-1",
        coupon_code: result.issuedCouponCode,
        expires_at: new Date("2026-11-06T00:00:00.000Z"),
      }),
    });
  });

  it("redeems an issued reward only for its assigned customer", async () => {
    mocks.transaction.contact.findFirst.mockResolvedValue({
      id: "customer-contact-1",
      legal_name: "Acme Retail",
      display_name: "ACME RETAIL",
    });
    mocks.transaction.posCouponIssue.findFirst.mockResolvedValue({
      id: "coupon-issue-1",
      coupon_id: "reward-campaign-1",
      customer_contact_id: "customer-contact-1",
      coupon_code: "CC-REWARD",
      coupon: {
        id: "reward-campaign-1",
        status: "ACTIVE",
        discount_type: "FLAT_AMOUNT",
        discount_value: new Prisma.Decimal("20"),
        max_redemptions: null,
      },
    });

    const result = await createPosGeneralStockSale({
      ...saleInput,
      customerContactId: "customer-contact-1",
      couponCode: "CC-REWARD",
    });

    expect(result).toMatchObject({
      couponDiscountAmount: "20.00",
      appliedCouponCode: "CC-REWARD",
    });
    expect(mocks.transaction.posCouponIssue.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "coupon-issue-1",
        organization_id: "organization-1",
        status: "AVAILABLE",
      },
      data: expect.objectContaining({
        status: "REDEEMED",
        redeemed_invoice_id: "invoice-1",
      }),
    }));
    expect(mocks.transaction.posCouponRedemption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "organization-1",
        coupon_id: "reward-campaign-1",
        coupon_issue_id: "coupon-issue-1",
        coupon_code: "CC-REWARD",
      }),
    });
  });

  it("posts direct General SKU stock, updates its balance, and records the SKU issue", async () => {
    const skuStock = {
      ...stockRecord,
      id: "sku-stock-1",
      current_stock: new Prisma.Decimal(8),
      size: "M",
    };
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([skuStock]);
    await createPosGeneralStockSale({
      ...saleInput,
      lines: [{ ...saleInput.lines[0], stockId: "sku-stock-1", stockType: "SKU" }],
    });

    expect(mocks.transaction.finishedGoodsSkuStock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "organization-1",
        id: { in: ["sku-stock-1"] },
      }),
    }));
    expect(mocks.transaction.finishedGoodsSkuStock.updateMany).toHaveBeenCalledWith({
      where: {
        id: "sku-stock-1",
        organization_id: "organization-1",
        storage_node_id: "leaf-1",
        current_stock: { gte: 2 },
      },
      data: {
        current_stock: { decrement: 2 },
        qty_out: { increment: 2 },
      },
    });
    expect(mocks.transaction.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.posSalesInvoiceLine.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        general_stock_receipt_id: null,
        sku_stock_id: "sku-stock-1",
      })],
    }));
    expect(mocks.createFgMaterialIssue).toHaveBeenCalledWith(mocks.transaction, expect.objectContaining({
      lines: [expect.objectContaining({
        stockType: "SKU",
        skuStockId: "sku-stock-1",
        generalReceiptId: null,
      })],
    }));
  });

  it("uses catalog prices and snapshots shipping details for online-store invoices", async () => {
    const skuStock = {
      ...stockRecord,
      id: "sku-store-stock-1",
      current_stock: new Prisma.Decimal(8),
      sales_price: new Prisma.Decimal("125.00"),
      mrp: new Prisma.Decimal("150.00"),
      gst_rate: new Prisma.Decimal("5.00"),
      hsn_code: "6105",
    };
    const shippingAddress = {
      recipientName: "Store Customer",
      phone: "9876543210",
      addressLine1: "12 Market Road",
      addressLine2: null,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      countryCode: "IN",
    };
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([skuStock]);
    await createPosGeneralStockSale({
      ...saleInput,
      salesChannel: "ONLINE_STORE",
      customerContactId: null,
      shippingAddress,
      customer: "STORE CUSTOMER",
      lines: [{
        stockId: "sku-store-stock-1",
        stockType: "SKU",
        quantity: "1",
        rate: "1",
        gstRate: "0",
        discountPercent: "0",
      }],
    });

    expect(mocks.transaction.posSalesInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customer: "STORE CUSTOMER",
        tax_mode: "LOCAL",
        shipping_address: {
          ...shippingAddress,
          recipientName: "STORE CUSTOMER",
          addressLine1: "12 MARKET ROAD",
          city: "BENGALURU",
          state: "KARNATAKA",
          postalCode: "560001",
        },
        subtotal: new Prisma.Decimal("125.00"),
        tax_amount: new Prisma.Decimal("6.25"),
      }),
    }));
    expect(mocks.transaction.posSalesInvoiceLine.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        sku_stock_id: "sku-store-stock-1",
        unit_rate: new Prisma.Decimal("125.00"),
        gst_rate: new Prisma.Decimal("5.00"),
        hsn_code: "6105",
      })],
    }));
    expect(mocks.transaction.organization.findFirst).toHaveBeenCalledWith({
      where: { id: "organization-1" },
      select: { state: true },
    });
  });

  it("uses interstate GST for an online shipping address outside the organization state", async () => {
    mocks.transaction.organization.findFirst.mockResolvedValue({ state: "Karnataka" });
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([{
      ...stockRecord,
      id: "sku-store-stock-1",
      current_stock: new Prisma.Decimal(8),
      sales_price: new Prisma.Decimal("125.00"),
      mrp: new Prisma.Decimal("150.00"),
      gst_rate: new Prisma.Decimal("5.00"),
      hsn_code: "6105",
    }]);
    await createPosGeneralStockSale({
      ...saleInput,
      salesChannel: "ONLINE_STORE",
      customerContactId: null,
      shippingAddress: {
        recipientName: "Store Customer",
        phone: "9876543210",
        addressLine1: "12 Market Road",
        addressLine2: null,
        city: "Pune",
        state: "Maharashtra",
        postalCode: "411001",
        countryCode: "IN",
      },
      lines: [{
        stockId: "sku-store-stock-1",
        stockType: "SKU",
        quantity: "1",
        rate: "1",
        gstRate: "0",
        discountPercent: "0",
      }],
    });

    expect(mocks.transaction.posSalesInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tax_mode: "INTERSTATE",
        igst_amount: new Prisma.Decimal("6.25"),
        cgst_amount: new Prisma.Decimal("0"),
        sgst_amount: new Prisma.Decimal("0"),
      }),
    }));
  });

  it("allows online checkout without a registered contact when a purchase-reward campaign is active", async () => {
    mocks.transaction.posCoupon.findFirst.mockResolvedValue({
      id: "reward-campaign-1",
      discount_value: new Prisma.Decimal("10"),
      validity_days: 30,
      max_redemptions: null,
    });
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([{
      ...stockRecord,
      id: "sku-store-stock-1",
      current_stock: new Prisma.Decimal(8),
      sales_price: new Prisma.Decimal("125.00"),
      mrp: new Prisma.Decimal("150.00"),
      gst_rate: new Prisma.Decimal("5.00"),
      hsn_code: "6105",
    }]);
    await expect(createPosGeneralStockSale({
      ...saleInput,
      salesChannel: "ONLINE_STORE",
      customerContactId: null,
      shippingAddress: {
        recipientName: "Store Customer",
        phone: "9876543210",
        addressLine1: "12 Market Road",
        addressLine2: null,
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        countryCode: "IN",
      },
      lines: [{
        stockId: "sku-store-stock-1",
        stockType: "SKU",
        quantity: "1",
        rate: "1",
        gstRate: "0",
        discountPercent: "0",
      }],
    })).resolves.toMatchObject({ invoiceNo: "POS-1" });

    expect(mocks.transaction.posCoupon.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.posCouponIssue.create).not.toHaveBeenCalled();
  });

  it("rejects online-store sales without shipping details or a catalog price", async () => {
    await expect(createPosGeneralStockSale({
      ...saleInput,
      salesChannel: "ONLINE_STORE",
      customerContactId: null,
      lines: [{
        stockId: "sku-store-stock-1",
        stockType: "SKU",
        quantity: "1",
        rate: "100",
        gstRate: "0",
        discountPercent: "0",
      }],
    })).rejects.toThrow("A shipping address is required");

    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([{
      ...stockRecord,
      id: "sku-store-stock-1",
      current_stock: new Prisma.Decimal(8),
      sales_price: null,
      mrp: null,
      gst_rate: null,
      hsn_code: null,
    }]);
    await expect(createPosGeneralStockSale({
      ...saleInput,
      salesChannel: "ONLINE_STORE",
      customerContactId: null,
      shippingAddress: {
        recipientName: "Store Customer",
        phone: "9876543210",
        addressLine1: "12 Market Road",
        addressLine2: null,
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        countryCode: "IN",
      },
      lines: [{
        stockId: "sku-store-stock-1",
        stockType: "SKU",
        quantity: "1",
        rate: "100",
        gstRate: "0",
        discountPercent: "0",
      }],
    })).rejects.toThrow("no active catalog sales price");
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
  });

  it("revalidates and applies a percentage offer to the line before tax", async () => {
    mocks.transaction.posOffer.findMany.mockResolvedValue([{
      id: "offer-1",
      organization_id: "organization-1",
      request_key: "offer-request-1",
      offer_code: "SAVE10",
      name: "TEN PERCENT OFF",
      description: null,
      offer_type: "PERCENTAGE",
      scope: "ALL",
      status: "ACTIVE",
      discount_amount: null,
      discount_percentage: new Prisma.Decimal("10"),
      buy_quantity: null,
      get_quantity: null,
      get_discount_percentage: null,
      combo_price: null,
      starts_at: new Date("2026-10-01T00:00:00.000Z"),
      ends_at: null,
      created_by: "user-1",
      created_at: new Date("2026-10-01T00:00:00.000Z"),
      updated_at: new Date("2026-10-01T00:00:00.000Z"),
      targets: [],
    }] as never);

    const result = await createPosGeneralStockSale({
      ...saleInput,
      lines: [{ ...saleInput.lines[0], offerId: "offer-1" }],
    });

    expect(result).toMatchObject({
      subtotal: "162.00",
      cgstAmount: "4.05",
      sgstAmount: "4.05",
      totalAmount: "170.10",
    });
    expect(mocks.transaction.posOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "organization-1",
        id: { in: ["offer-1"] },
        status: "ACTIVE",
      }),
    }));
    expect(mocks.transaction.posSalesInvoiceLine.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        offer_discount_amount: new Prisma.Decimal("18.00"),
        offer_snapshot: expect.objectContaining({
          id: "offer-1",
          code: "SAVE10",
          discountAmount: "18.00",
        }),
        taxable_amount: new Prisma.Decimal("162.00"),
      })],
    }));
  });

  it("applies buy/get discounts only when a line meets the configured pack size", async () => {
    mocks.transaction.posOffer.findMany.mockResolvedValue([{
      id: "bogo-1",
      organization_id: "organization-1",
      request_key: "bogo-request-1",
      offer_code: "BUY2GET1",
      name: "BUY TWO GET ONE",
      description: null,
      offer_type: "BUY_ONE_GET_ONE",
      scope: "ALL",
      status: "ACTIVE",
      discount_amount: null,
      discount_percentage: null,
      buy_quantity: 2,
      get_quantity: 1,
      get_discount_percentage: new Prisma.Decimal("100"),
      combo_price: null,
      starts_at: new Date("2026-10-01T00:00:00.000Z"),
      ends_at: null,
      created_by: "user-1",
      created_at: new Date("2026-10-01T00:00:00.000Z"),
      updated_at: new Date("2026-10-01T00:00:00.000Z"),
      targets: [],
    }] as never);

    const result = await createPosGeneralStockSale({
      ...saleInput,
      lines: [{
        ...saleInput.lines[0],
        quantity: "3",
        discountPercent: "0",
        offerId: "bogo-1",
      }],
    });

    expect(result.subtotal).toBe("200.00");
    expect(mocks.transaction.posSalesInvoiceLine.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        offer_discount_amount: new Prisma.Decimal("100.00"),
        taxable_amount: new Prisma.Decimal("200.00"),
      })],
    }));
  });

  it("rejects an unavailable or cross-organization offer selection", async () => {
    await expect(createPosGeneralStockSale({
      ...saleInput,
      lines: [{ ...saleInput.lines[0], offerId: "foreign-offer" }],
    })).rejects.toThrow("inactive or not available on the invoice date");
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
  });

  it("rejects SKU IDs that are outside the authorized organization", async () => {
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([]);

    await expect(createPosGeneralStockSale({
      ...saleInput,
      lines: [{ ...saleInput.lines[0], stockType: "SKU" }],
    })).rejects.toThrow("not General stock in this organization");
    expect(mocks.transaction.finishedGoodsSkuStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.posSalesInvoice.create).not.toHaveBeenCalled();
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
      store_credit_applied_amount: new Prisma.Decimal("0.00"),
      coupon_discount_amount: new Prisma.Decimal("0.00"),
      entity: { entity_name: "Store A" },
      couponRedemption: null,
      issuedCoupon: null,
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
    expect(mocks.transaction.posSalesInvoiceLine.createManyAndReturn).not.toHaveBeenCalled();
  });
});
