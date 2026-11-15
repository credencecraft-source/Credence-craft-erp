import { FinanceDocumentType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  mapToTallyPrimeXml,
  mapToZohoBooksPayload,
  type SyncableFinanceTransaction,
} from "@/lib/services/finance/accounting-sync-adapter";

function transaction(
  documentType: FinanceDocumentType,
): SyncableFinanceTransaction {
  return {
    documentType,
    documentNumber: "DOC-1",
    documentDate: "2026-11-18",
    currencyCode: "INR",
    partyName: "PARTY",
    partyGstin: null,
    subtotal: "100.00",
    cgstAmount: "9.00",
    sgstAmount: "9.00",
    igstAmount: "0.00",
    otherTaxAmount: "0.00",
    totalAmount: "118.00",
    lines: [{
      itemCode: "SKU-1",
      description: "ITEM",
      quantity: "1.0000",
      unitOfMeasure: "PCS",
      unitRate: "100.0000",
      discountAmount: "0.00",
      hsnCode: "6109",
      gstRate: "18.0000",
      taxableAmount: "100.00",
      cgstAmount: "9.00",
      sgstAmount: "9.00",
      igstAmount: "0.00",
      otherTaxAmount: "0.00",
    }],
  };
}

describe("accounting sync adapter contracts", () => {
  it("maps a sales invoice to balanced Tally XML and escapes XML values", () => {
    const xml = mapToTallyPrimeXml(
      { ...transaction(FinanceDocumentType.SALES_INVOICE), documentNumber: "INV&1" },
      {
        companyName: "COMPANY <ONE>",
        partyLedgerName: "CUSTOMER",
        transactionLedgerName: "SALES",
        cgstLedgerName: "CGST",
        sgstLedgerName: "SGST",
      },
    );

    expect(xml).toContain("<SVCURRENTCOMPANY>COMPANY &lt;ONE&gt;</SVCURRENTCOMPANY>");
    expect(xml).toContain("<VOUCHER VCHTYPE=\"Sales\"");
    expect(xml).toContain("<VOUCHERNUMBER>INV&amp;1</VOUCHERNUMBER>");
    expect(xml.match(/<ALLLEDGERENTRIES\.LIST>/g)).toHaveLength(4);
    expect(xml).toContain("<AMOUNT>-100.00</AMOUNT>");
  });

  it("maps Zoho sales invoices with stable string rates and tenant-provided IDs", () => {
    const payload = mapToZohoBooksPayload(
      transaction(FinanceDocumentType.SALES_INVOICE),
      {
        partyId: "zoho-customer-1",
        itemIdByCode: { "SKU-1": "zoho-item-1" },
        taxIdByRate: { "18.0000": "zoho-tax-18" },
      },
    );

    expect(payload).toEqual(expect.objectContaining({
      customer_id: "zoho-customer-1",
      reference_number: "DOC-1",
      currency_code: "INR",
      line_items: [{
        item_id: "zoho-item-1",
        name: "ITEM",
        quantity: "1.0000",
        rate: "100.0000",
        hsn_or_sac: "6109",
        tax_id: "zoho-tax-18",
      }],
    }));
  });

  it("refuses logistics challans from both accounting-provider mappers", () => {
    const challan = transaction(FinanceDocumentType.DELIVERY_CHALLAN);
    expect(() => mapToTallyPrimeXml(challan, {
      companyName: "COMPANY",
      partyLedgerName: "PARTY",
      transactionLedgerName: "SALES",
    })).toThrow("logistics records");
    expect(() => mapToZohoBooksPayload(challan, {
      partyId: "party",
      itemIdByCode: { "SKU-1": "item" },
      taxIdByRate: { "18.0000": "tax" },
    })).toThrow("logistics records");
  });
});
