import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { validateProcurementVendorBillSources } from "@/lib/services/finance/procurement-vendor-bill-validation";

function transactionClient(input: {
  accepted: string;
  previouslyBilled: string;
}) {
  const orderLine = {
    id: "po-line-1",
    raw_material: "FABRIC",
    style_name: null,
    category: "TEXTILE",
    quantity: new Prisma.Decimal("10"),
    price: new Prisma.Decimal("100"),
    gst: new Prisma.Decimal("18"),
    tax_type: "LOCAL",
    hsn_code: "6109",
    stock_uom: "MTR",
  };
  const receiptLine = {
    id: "grn-line-1",
    receipt_id: "grn-1",
    purchase_order_line_id: "po-line-1",
    accepted_quantity: new Prisma.Decimal(input.accepted),
    receipt: { id: "grn-1", receipt_no: "GRN-1", received_date: new Date("2026-11-18") },
  };
  const tx = {
    purchaseOrder: {
      findFirst: vi.fn().mockResolvedValue({
        id: "po-1",
        organization_id: "org-A",
        entity_id: "entity-A",
        vendor_id: "vendor-A",
        contact_id: null,
        status: "APPROVED",
        lines: [orderLine],
        entity: { id: "entity-A", entity_name: "ENTITY A", is_active: true },
      }),
    },
    masterVendor: {
      findFirst: vi.fn().mockResolvedValue({
        id: "vendor-A",
        vendor: "VENDOR A",
        gst_number: "27FGHIJ6789K1Z2",
        contact_id: null,
        is_active: true,
      }),
    },
    inventoryReceiptLine: {
      findMany: vi.fn()
        .mockResolvedValueOnce([receiptLine])
        .mockResolvedValueOnce([{
          id: receiptLine.id,
          purchase_order_line_id: receiptLine.purchase_order_line_id,
          accepted_quantity: receiptLine.accepted_quantity,
        }]),
    },
    procurementVendorBillLine: {
      findMany: vi.fn().mockResolvedValue(input.previouslyBilled === "0" ? [] : [{
        inventory_receipt_line_id: "grn-line-1",
        purchase_order_line_id: "po-line-1",
        quantity: new Prisma.Decimal(input.previouslyBilled),
      }]),
    },
    masterEntity: {
      findFirst: vi.fn().mockResolvedValue({
        gstin: "27ABCDE1234F1Z5",
        registered_state: "Maharashtra",
      }),
    },
    entityGstRegistration: { findFirst: vi.fn() },
    contactTaxRegistration: { findFirst: vi.fn() },
    masterHsn: { findMany: vi.fn().mockResolvedValue([{ hsn_code: "6109" }]) },
    masterGst: {
      findMany: vi.fn().mockResolvedValue([{
        gst: new Prisma.Decimal("18"),
        cgst_rate: null,
        sgst_rate: null,
        igst_rate: null,
      }]),
    },
  };
  return tx;
}

const request = {
  organizationId: "org-A",
  entityId: "entity-A",
  vendorId: "vendor-A",
  purchaseOrderId: "po-1",
  billDate: new Date("2026-11-18T00:00:00.000Z"),
  lines: [{
    purchaseOrderLineId: "po-line-1",
    inventoryReceiptLineId: "grn-line-1",
    quantity: "2",
  }],
};

describe("validateProcurementVendorBillSources", () => {
  it("uses organization-scoped PO, GRN and bill-balance reads and calculates local GST", async () => {
    const tx = transactionClient({ accepted: "5", previouslyBilled: "1" });
    const result = await validateProcurementVendorBillSources(
      tx as unknown as Prisma.TransactionClient,
      request,
    );

    expect(result.tax.mode).toBe("LOCAL");
    expect(result.tax.cgstAmount.toFixed(2)).toBe("18.00");
    expect(result.tax.sgstAmount.toFixed(2)).toBe("18.00");
    expect(result.tax.igstAmount.isZero()).toBe(true);
    expect(result.lines[0].totalAmount.toFixed(2)).toBe("236.00");
    expect(tx.purchaseOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "org-A", id: "po-1" }),
    }));
    expect(tx.inventoryReceiptLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        receipt: expect.objectContaining({ organization_id: "org-A", purchase_order_id: "po-1" }),
      }),
    }));
    expect(tx.procurementVendorBillLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-A",
        bill: expect.objectContaining({ organization_id: "org-A" }),
      }),
    }));
  });

  it("rejects quantities exceeding the accepted GRN balance", async () => {
    const tx = transactionClient({ accepted: "5", previouslyBilled: "4" });
    await expect(validateProcurementVendorBillSources(
      tx as unknown as Prisma.TransactionClient,
      { ...request, lines: [{ ...request.lines[0], quantity: "2" }] },
    )).rejects.toThrow("exceeds the accepted GRN balance");
  });

  it("rejects quantities exceeding the remaining Purchase Order balance", async () => {
    const tx = transactionClient({ accepted: "15", previouslyBilled: "9" });
    await expect(validateProcurementVendorBillSources(
      tx as unknown as Prisma.TransactionClient,
      { ...request, lines: [{ ...request.lines[0], quantity: "2" }] },
    )).rejects.toThrow("exceeds the remaining Purchase Order balance");
  });
});
