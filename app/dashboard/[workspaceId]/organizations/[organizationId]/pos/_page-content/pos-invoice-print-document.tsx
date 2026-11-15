"use client";

import { Printer } from "lucide-react";
import Button from "@/components/ui/Button";
import type { OrganizationPrintTemplateDesign } from "@/lib/services/distribution/organization-print-template-contract";

type PosInvoiceLine = {
  record: {
    id: string;
    style_name: string;
    order_no: string;
    article_no: string;
    size: string | null;
    colour: string | null;
    hsn_code?: string | null;
  };
  appliedOffer?: {
    code: string;
    name: string;
    discountAmount: string;
  } | null;
  quantity: number;
  rate: number;
  gstRate?: number;
  discountPercent?: number;
  amount: number;
  taxAmount?: number;
  totalAmount?: number;
};

export type PosInvoicePrintData = {
  invoiceNumber: string;
  invoiceDate: string;
  customer: string;
  shippingAddress?: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
    countryCode: string;
  } | null;
  entityName?: string;
  appliedCouponCode?: string | null;
  appliedCouponName?: string | null;
  appliedCouponDiscountType?: "FLAT_AMOUNT" | "PERCENTAGE" | null;
  appliedCouponDiscountValue?: number | null;
  appliedCouponDiscountAmount?: number | null;
  couponDiscountAmount?: number;
  issuedCouponCode?: string | null;
  issuedCouponExpiresAt?: string | null;
  issuedCouponName?: string | null;
  issuedCouponDiscountType?: "FLAT_AMOUNT" | "PERCENTAGE" | null;
  issuedCouponDiscountValue?: number | null;
  status?: string;
  issuer?: {
    name: string;
    gstNumber: string;
    address: string;
  };
  lines: PosInvoiceLine[];
  subtotal: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  storeCreditAppliedAmount?: number;
  amountDue?: number;
};

const itemFieldLabels: Record<string, string> = {
  description: "Description of goods",
  hsnCode: "HSN code",
  booking: "Booking",
  order: "Order / Barcode",
  sizeBreakdown: "Article / Size",
  quantity: "Qty",
  unitPrice: "Rate",
  beforeTax: "Taxable value",
  gstRate: "GST rate",
  tax: "GST",
  amount: "Amount",
};

const summaryLabels: Record<string, string> = {
  totalQuantity: "Total quantity",
  beforeTax: "Taxable value",
  deliveryCharge: "Delivery charge",
  cgst: "CGST",
  sgst: "SGST",
  igst: "IGST",
  vatSalesTax: "VAT / Sales tax",
  totalTax: "Total tax",
  grandTotal: "Grand total",
  couponDiscount: "Coupon discount",
  linkedQuotations: "Linked quotations",
};

function formatAmount(amount: number) {
  return `Rs ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getItemValue(field: string, line: PosInvoiceLine) {
  switch (field) {
    case "description":
      return (
        <>
          <span className="font-semibold">{line.record.style_name}</span>
          {line.record.colour ? <span className="block text-xs">{line.record.colour}</span> : null}
          {line.appliedOffer ? (
            <span className="block text-xs">
              Offer: {line.appliedOffer.code} — {line.appliedOffer.name}
            </span>
          ) : null}
        </>
      );
    case "hsnCode":
      return line.record.hsn_code || "—";
    case "booking":
      return "—";
    case "order":
      return line.record.order_no || line.record.id;
    case "sizeBreakdown":
      return [line.record.article_no, line.record.size].filter(Boolean).join(" / ") || "—";
    case "quantity":
      return `${line.quantity} PCS`;
    case "unitPrice":
      return formatAmount(line.rate);
    case "beforeTax":
      return formatAmount(line.amount);
    case "gstRate":
      return `${line.gstRate ?? 0}%`;
    case "tax":
      return formatAmount(line.taxAmount ?? 0);
    case "amount":
      return formatAmount(line.totalAmount ?? line.amount + (line.taxAmount ?? 0));
    default:
      return "—";
  }
}

function getSummaryValue(field: string, invoice: PosInvoicePrintData) {
  switch (field) {
    case "totalQuantity":
      return `${invoice.lines.reduce((total, line) => total + line.quantity, 0)} PCS`;
    case "beforeTax":
      return formatAmount(invoice.subtotal);
    case "cgst":
      return formatAmount(invoice.cgstAmount ?? 0);
    case "sgst":
      return formatAmount(invoice.sgstAmount ?? 0);
    case "igst":
      return formatAmount(invoice.igstAmount ?? 0);
    case "totalTax":
      return formatAmount(invoice.taxAmount ?? 0);
    case "grandTotal":
      return formatAmount(invoice.grandTotal ?? invoice.subtotal + (invoice.taxAmount ?? 0));
    case "couponDiscount":
      return formatAmount(invoice.couponDiscountAmount ?? 0);
    default:
      return null;
  }
}

export default function PosInvoicePrintDocument({
  invoice,
  design,
  onBack,
  printDisabled = false,
}: {
  invoice: PosInvoicePrintData;
  design: OrganizationPrintTemplateDesign;
  onBack: () => void;
  printDisabled?: boolean;
}) {
  const { sections } = design;
  const pageSize = design.orientation === "LANDSCAPE" ? "landscape" : "portrait";
  const paperSize = design.pageSize === "A4" ? "A4" : "letter";
  const issuedCouponBenefit = invoice.issuedCouponDiscountType && invoice.issuedCouponDiscountValue !== null
    && invoice.issuedCouponDiscountValue !== undefined
    ? invoice.issuedCouponDiscountType === "PERCENTAGE"
      ? `${invoice.issuedCouponDiscountValue}% off on the next purchase`
      : `${formatAmount(invoice.issuedCouponDiscountValue)} off on the next purchase`
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <style>{`
        @page {
          size: ${paperSize} ${pageSize};
          margin: 0;
        }
        @media print {
          .pos-invoice-paper {
            width: auto !important;
            max-width: none !important;
            min-height: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            break-after: page;
          }
          .pos-invoice-page-number::after {
            content: counter(page) " / " counter(pages);
          }
        }
      `}</style>
      <div className="flex items-center justify-between print:hidden">
        <Button type="button" variant="ghost" onClick={onBack}>
          &larr; Invoice details
        </Button>
        <Button
          type="button"
          onClick={() => window.print()}
          disabled={printDisabled}
          className="inline-flex items-center gap-2"
        >
          <Printer className="h-4 w-4" /> Print Tax Invoice
        </Button>
      </div>

      <article
        aria-label="POS tax invoice print preview"
        className="pos-invoice-paper mx-auto min-h-[36rem] w-full max-w-[210mm] border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-[var(--erp-shadow)] print:max-w-none"
        style={{
          color: design.textColor,
          fontFamily: design.fontFamily,
          fontSize: `${design.bodyFontSize}pt`,
          padding: `${design.margins.top}mm ${design.margins.right}mm ${design.margins.bottom}mm ${design.margins.left}mm`,
        }}
      >
        <header className="border-t-4 pt-3" style={{ borderColor: design.accentColor }}>
          <div className="flex items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-3">
              {sections.headerFields.includes("companyLogo") && design.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={design.logoDataUrl} alt="Company logo" className="max-h-16 max-w-24 object-contain" />
              ) : null}
              {sections.headerFields.includes("companyName") ? (
                <div className="min-w-0">
                  <h2 className="break-words font-bold" style={{ fontSize: `${design.headingFontSize}pt` }}>
                    {invoice.issuer?.name || "Organization"}
                  </h2>
                  {invoice.issuer?.address ? <p className="mt-1 whitespace-pre-line">{invoice.issuer.address}</p> : null}
                  {invoice.issuer?.gstNumber ? <p>GSTIN: {invoice.issuer.gstNumber}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <h1 className="font-bold" style={{ color: design.accentColor, fontSize: `${design.headingFontSize}pt` }}>
                TAX INVOICE
              </h1>
              {sections.headerFields.includes("documentNumber") ? <p>Invoice No.: {invoice.invoiceNumber}</p> : null}
              {sections.headerFields.includes("documentDate") ? <p>Date: {invoice.invoiceDate}</p> : null}
              {sections.headerFields.includes("status") ? <p>Status: {invoice.status ?? "POSTED"}</p> : null}
            </div>
          </div>
          {sections.headerFields.includes("billTo") ? (
            <section className="mt-4 border border-[var(--erp-border)] p-3">
              <h2 className="font-semibold" style={{ color: design.accentColor }}>BILL TO</h2>
              <p>{invoice.customer || "Customer not linked"}</p>
              {invoice.shippingAddress ? (
                <address className="mt-1 whitespace-pre-line not-italic">
                  {[
                    invoice.shippingAddress.recipientName,
                    invoice.shippingAddress.phone,
                    invoice.shippingAddress.addressLine1,
                    invoice.shippingAddress.addressLine2,
                    [
                      invoice.shippingAddress.city,
                      invoice.shippingAddress.state,
                      invoice.shippingAddress.postalCode,
                      invoice.shippingAddress.countryCode,
                    ].join(", "),
                  ].filter(Boolean).join("\n")}
                </address>
              ) : null}
            </section>
          ) : null}
          <section className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {invoice.entityName ? <p><span className="font-semibold">Entity / Store:</span> {invoice.entityName}</p> : null}
            {invoice.appliedCouponCode ? (
              <p>
                <span className="font-semibold">Coupon applied:</span> {invoice.appliedCouponCode}
                {" · "}{formatAmount(invoice.couponDiscountAmount ?? 0)}
              </p>
            ) : null}
            {invoice.issuedCouponCode ? (
              <p>
                <span className="font-semibold">Next-purchase reward:</span>{" "}
                {invoice.issuedCouponName ? `${invoice.issuedCouponName} · ` : ""}
                {invoice.issuedCouponCode}
                {issuedCouponBenefit ? ` · ${issuedCouponBenefit}` : ""}
                {invoice.issuedCouponExpiresAt ? ` · Valid through ${invoice.issuedCouponExpiresAt}` : ""}
              </p>
            ) : null}
          </section>
          {design.headerText ? <p className="mt-3 whitespace-pre-wrap">{design.headerText}</p> : null}
        </header>

        <section className="mt-5">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ backgroundColor: design.tableHeaderColor, color: design.tableHeaderTextColor }}>
                  {sections.itemFields
                    .filter((field) => field !== "booking")
                    .map((field) => (
                      <th key={field} className="border px-2 py-2 font-semibold">{itemFieldLabels[field]}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, index) => (
                  <tr key={`${line.record.id}-${index}`} className="border-b border-[var(--erp-border)]">
                    {sections.itemFields
                      .filter((field) => field !== "booking")
                      .map((field) => (
                        <td key={field} className="border border-[var(--erp-border)] px-2 py-2 align-top">
                          {getItemValue(field, line)}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {sections.summaryFields.length ? (
          <section className="mt-5">
            <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-4">
              {sections.summaryFields.map((field) => {
                const value = getSummaryValue(field, invoice);
                return value === null ? null : (
                  <div key={field} className="col-span-2 grid grid-cols-subgrid border-b border-[var(--erp-border)] py-2">
                    <dt className={field === "grandTotal" ? "font-bold" : ""}>{summaryLabels[field]}</dt>
                    <dd className={`text-right ${field === "grandTotal" ? "font-bold" : ""}`}>{value}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ) : null}

        <footer className="mt-6 border-t border-[var(--erp-border)] pt-3">
          {sections.showPaymentTerms ? (
            <p className="whitespace-pre-wrap">
              <span className="font-semibold">Payment terms: </span>
              {sections.paymentTermsText}
            </p>
          ) : null}
          {sections.showSpecialNotes && design.footerText ? (
            <p className="mt-2 whitespace-pre-wrap">{design.footerText}</p>
          ) : null}
          {design.showPageNumbers ? (
            <p className="pos-invoice-page-number mt-3 text-right">Page </p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
