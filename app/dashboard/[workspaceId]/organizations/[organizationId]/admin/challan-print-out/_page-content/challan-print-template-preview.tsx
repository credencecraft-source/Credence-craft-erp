import Card from "@/components/ui/Card";
import type { OrganizationPrintTemplateDesign } from "@/lib/services/distribution/organization-print-template-contract";

type DocumentType = "SALES_ORDER" | "QUOTATION" | "POS_INVOICE";

const itemFieldLabels: Record<string, string> = {
  description: "Item / Description",
  hsnCode: "HSN Code",
  booking: "Booking",
  order: "Order",
  sizeBreakdown: "Size Breakdown",
  quantity: "Qty",
  unitPrice: "Unit Price",
  beforeTax: "Before Tax",
  gstRate: "GST Rate",
  tax: "Tax",
  amount: "Amount",
};

const itemSamples: Record<string, string> = {
  description: "CLASSIC COTTON SHIRT",
  hsnCode: "6205",
  booking: "BK-1048",
  order: "ORD-2084",
  sizeBreakdown: "M: 40, L: 60",
  quantity: "100",
  unitPrice: "₹ 850.00",
  beforeTax: "₹ 85,000.00",
  gstRate: "18%",
  tax: "₹ 15,300.00",
  amount: "₹ 1,00,300.00",
};

const summaryLabels: Record<string, string> = {
  totalQuantity: "Total Quantity",
  beforeTax: "Before Tax",
  deliveryCharge: "Delivery Charge",
  cgst: "CGST",
  sgst: "SGST",
  igst: "IGST",
  vatSalesTax: "VAT / Sales Tax",
  totalTax: "Total Tax",
  grandTotal: "Grand Total",
  linkedQuotations: "Linked Quotations",
};

const summarySamples: Record<string, string> = {
  totalQuantity: "100 PCS",
  beforeTax: "₹ 85,000.00",
  deliveryCharge: "₹ 0.00",
  cgst: "₹ 7,650.00",
  sgst: "₹ 7,650.00",
  igst: "₹ 0.00",
  vatSalesTax: "₹ 0.00",
  totalTax: "₹ 15,300.00",
  grandTotal: "₹ 1,00,300.00",
  linkedQuotations: "2 linked quotations",
};

export default function ChallanPrintTemplatePreview({
  documentType,
  name,
  design,
}: {
  documentType: DocumentType;
  name: string;
  design: OrganizationPrintTemplateDesign;
}) {
  const { sections } = design;
  const pageTitle = documentType === "POS_INVOICE"
    ? "TAX INVOICE"
    : documentType === "SALES_ORDER"
      ? "SALES ORDER"
      : "QUOTATION";
  const pageSize = design.orientation === "LANDSCAPE" ? "landscape" : "portrait";

  return (
    <Card className="min-w-0 space-y-3 p-3 sm:p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
      <div>
        <h2 className="text-base font-semibold text-[var(--erp-text)]">
          {name.trim() ? `Live document preview: ${name}` : "Live document preview"}
        </h2>
        <p className="mt-1 text-xs text-[var(--erp-muted)]">
          Sample data · {design.pageSize} {pageSize}
        </p>
      </div>
      <div className="min-w-0 overflow-auto rounded-lg bg-[var(--erp-bg)] p-1">
        <article
          aria-label={`${pageTitle} print preview`}
          className={`mx-auto w-full max-w-none border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-[var(--erp-shadow)] ${
            pageSize === "portrait" ? "min-h-[36rem]" : "min-h-[25rem]"
          }`}
          style={{
            aspectRatio: pageSize === "portrait" ? "210 / 297" : "297 / 210",
            color: design.textColor,
            fontFamily: design.fontFamily,
            padding: `${design.margins.top}mm ${design.margins.right}mm ${design.margins.bottom}mm ${design.margins.left}mm`,
          }}
        >
          <section aria-label="Header" className="border-t-4 pt-3" style={{ borderColor: design.accentColor }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                {sections.headerFields.includes("companyLogo") && design.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={design.logoDataUrl} alt="Company logo" className="h-10 max-w-16 object-contain" />
                ) : null}
                {sections.headerFields.includes("companyName") ? (
                  <div className="min-w-0">
                    <p className="break-words font-bold" style={{ fontSize: design.headingFontSize }}>
                      CREDENCE CRAFT
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[0.55rem] text-[var(--erp-muted)]">
                      24 INDUSTRIAL ESTATE, BENGALURU · GSTIN: 29ABCDE1234F1Z5
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold" style={{ color: design.accentColor, fontSize: design.headingFontSize }}>
                  {pageTitle}
                </p>
                {sections.headerFields.includes("documentNumber") ? (
                  <p className="mt-1 text-xs">
                    {documentType === "POS_INVOICE"
                      ? "Invoice No."
                      : documentType === "SALES_ORDER"
                        ? "Sales Order No."
                        : "Quotation No."}: SO-2026-0104
                  </p>
                ) : null}
                {sections.headerFields.includes("documentDate") ? (
                  <p className="text-xs">Date: 04 NOV 2026</p>
                ) : null}
                {sections.headerFields.includes("status") ? (
                  <p className="text-xs">Status: CONFIRMED</p>
                ) : null}
              </div>
            </div>
            {sections.headerFields.some((field) => field === "billTo" || field === "shipTo") ? (
              <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 text-xs">
                {(["billTo", "shipTo"] as const)
                  .filter((field) => sections.headerFields.includes(field))
                  .map((field) => (
                    <div key={field} className="min-w-0 rounded border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-2">
                      <p className="font-semibold" style={{ color: design.accentColor }}>
                        {field === "billTo" ? "BILL TO" : "SHIP TO"}
                      </p>
                      <p className="mt-1 font-medium">SAMPLE BUYER PRIVATE LIMITED</p>
                      <p className="text-[var(--erp-muted)]">12 MARKET ROAD, BENGALURU · GSTIN 29ABCDE1234F1Z5</p>
                    </div>
                  ))}
              </div>
            ) : null}
            {design.headerText ? (
              <p className="mt-2 whitespace-pre-wrap text-xs">{design.headerText}</p>
            ) : null}
          </section>

          <section aria-label="Item table" className="mt-4">
            <h3 className="mb-2 text-xs font-bold">ITEM DETAILS</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[0.55rem]">
                <thead>
                  <tr style={{ backgroundColor: design.tableHeaderColor, color: design.tableHeaderTextColor }}>
                    {sections.itemFields
                      .filter((field) => documentType !== "POS_INVOICE" || field !== "booking")
                      .map((field) => (
                      <th key={field} className="whitespace-nowrap border px-1.5 py-1 font-semibold">
                        {itemFieldLabels[field]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1].map((row) => (
                    <tr key={row} className={row === 1 ? "bg-[var(--erp-surface-soft)]" : ""}>
                      {sections.itemFields
                        .filter((field) => documentType !== "POS_INVOICE" || field !== "booking")
                        .map((field) => (
                        <td key={field} className="max-w-32 border border-[var(--erp-border)] px-1.5 py-1">
                          {row === 0 ? itemSamples[field] : field === "description" ? "LINEN TROUSER" : itemSamples[field]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-label="Summary" className="mt-4">
            <h3 className="mb-2 text-xs font-bold">SUMMARY</h3>
            <dl className="ml-auto grid max-w-64 grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
              {sections.summaryFields
                .filter((field) => documentType !== "POS_INVOICE" || field !== "deliveryCharge")
                .map((field) => (
                <div key={field} className="col-span-2 grid grid-cols-subgrid border-b border-[var(--erp-border)] py-1">
                  <dt className={field === "grandTotal" ? "font-bold" : ""}>{summaryLabels[field]}</dt>
                  <dd className={`text-right ${field === "grandTotal" ? "font-bold" : ""}`}>
                    {summarySamples[field]}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label="Footer" className="mt-4 border-t border-[var(--erp-border)] pt-3 text-xs">
            <h3 className="mb-2 font-bold">FOOTER</h3>
            {sections.showPaymentTerms ? (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold">Payment Terms: </span>
                {sections.paymentTermsText || "50% ADVANCE, BALANCE WITHIN 30 DAYS"}
              </p>
            ) : null}
            {sections.showSpecialNotes ? (
              <p className="mt-2 whitespace-pre-wrap">
                <span className="font-semibold">Special Notes: </span>
                {design.footerText || "DELIVERY AS PER AGREED SCHEDULE."}
              </p>
            ) : null}
            {design.showPageNumbers ? (
              <p className="mt-3 border-t border-[var(--erp-border)] pt-2 text-right text-[var(--erp-muted)]">
                Page 1 of 1
              </p>
            ) : null}
          </section>
        </article>
      </div>
      <p className="text-xs text-[var(--erp-muted)]">
        Preview uses representative values. The saved template is applied to real document data when its PDF is generated.
      </p>
    </Card>
  );
}
