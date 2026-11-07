import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDefaultOrganizationPrintTemplateDesign } from "@/lib/services/distribution/organization-print-template-contract";
import PosInvoicePrintDocument from "./pos-invoice-print-document";

describe("POS invoice print document", () => {
  it("renders configured POS invoice fields and calculated totals", () => {
    const markup = renderToStaticMarkup(
      <PosInvoicePrintDocument
        invoice={{
          invoiceNumber: "POS-0001",
          invoiceDate: "2026-11-05",
          customer: "Sample customer",
          issuer: {
            name: "Example Organization",
            gstNumber: "29ABCDE1234F1Z5",
            address: "1 Market Road, Bengaluru",
          },
          lines: [{
            record: {
              id: "sku-1",
              style_name: "Printed shirt",
              order_no: "DIRECT",
              article_no: "GPR-0001",
              size: "L",
              colour: "BLACK",
              hsn_code: "6205",
            },
            quantity: 3,
            rate: 100,
            gstRate: 5,
            amount: 300,
            taxAmount: 15,
            totalAmount: 315,
          }],
          subtotal: 300,
          cgstAmount: 7.5,
          sgstAmount: 7.5,
          igstAmount: 0,
          taxAmount: 15,
          grandTotal: 315,
        }}
        design={getDefaultOrganizationPrintTemplateDesign("POS_INVOICE")}
        onBack={vi.fn()}
      />,
    );

    expect(markup).toContain("POS-0001");
    expect(markup).toContain("Example Organization");
    expect(markup).toContain("6205");
    expect(markup).toContain("5%");
    expect(markup).toContain("3 PCS");
    expect(markup).toContain("Rs 315.00");
  });
});
