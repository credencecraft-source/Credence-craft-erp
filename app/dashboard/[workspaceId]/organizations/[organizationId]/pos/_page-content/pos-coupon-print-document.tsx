"use client";

import { Printer } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { PosInvoicePrintData } from "./pos-invoice-print-document";

function formatAmount(amount: number) {
  return `Rs ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PosCouponPrintDocument({
  invoice,
  onBack,
}: {
  invoice: PosInvoicePrintData;
  onBack: () => void;
}) {
  const couponCode = invoice.issuedCouponCode ?? invoice.appliedCouponCode ?? "";
  const isRewardCoupon = Boolean(invoice.issuedCouponCode);
  const discountType = isRewardCoupon
    ? invoice.issuedCouponDiscountType
    : invoice.appliedCouponDiscountType;
  const discountValue = isRewardCoupon
    ? invoice.issuedCouponDiscountValue
    : invoice.appliedCouponDiscountValue;
  const couponName = isRewardCoupon ? invoice.issuedCouponName : invoice.appliedCouponName;
  const discountLabel = discountType && discountValue !== null && discountValue !== undefined
    ? discountType === "PERCENTAGE"
      ? `${discountValue}% OFF`
      : `${formatAmount(discountValue)} OFF`
    : !isRewardCoupon && invoice.appliedCouponDiscountAmount !== null
      && invoice.appliedCouponDiscountAmount !== undefined
      ? `${formatAmount(invoice.appliedCouponDiscountAmount)} SAVED`
      : "Benefit details unavailable";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          .pos-coupon-paper {
            max-width: none !important;
            min-height: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            break-after: page;
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
          className="inline-flex items-center gap-2"
        >
          <Printer className="h-4 w-4" /> Print Coupon Code
        </Button>
      </div>

      <article
        aria-label="POS coupon code print preview"
        className="pos-coupon-paper mx-auto min-h-[24rem] w-full max-w-[210mm] overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] text-center text-[var(--erp-text)] shadow-[var(--erp-shadow)] print:max-w-none print:rounded-none"
      >
        <header className="border-b border-[var(--erp-border)] bg-[var(--erp-brand-soft)] px-8 py-8">
          <p className="erp-eyebrow">{isRewardCoupon ? "A reward for your next purchase" : "Coupon applied"}</p>
          <h1 className="mt-2 text-3xl font-bold">{couponName || "Your Coupon"}</h1>
          <p className="mt-2 text-sm text-[var(--erp-muted)]">
            {isRewardCoupon
              ? "Use this code on your next eligible purchase."
              : "This code was used on this invoice."}
          </p>
          <div className="mt-5">
            <Badge className="px-5 py-2 text-lg" aria-label={`Coupon benefit: ${discountLabel}`}>
              {discountLabel}
            </Badge>
          </div>
        </header>

        <div className="px-8 py-8">
          <div className="mx-auto max-w-xl rounded-xl border-2 border-dashed border-[var(--erp-brand)] bg-[var(--erp-surface)] p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-muted)]">
              {isRewardCoupon ? "Your redeemable code" : "Coupon code"}
            </p>
            <p className="mt-3 break-all text-3xl font-bold tracking-wider text-[var(--erp-brand)]">
              {couponCode}
            </p>
          </div>

          <dl className="mx-auto mt-8 grid max-w-xl gap-4 text-left text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-[var(--erp-muted)]">Customer</dt>
              <dd className="mt-1 font-semibold">{invoice.customer || "Walk-in customer"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--erp-muted)]">Issued with invoice</dt>
              <dd className="mt-1 font-semibold">{invoice.invoiceNumber}</dd>
            </div>
            {invoice.issuedCouponExpiresAt ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-[var(--erp-muted)]">Valid through</dt>
                <dd className="mt-1 font-semibold">{invoice.issuedCouponExpiresAt}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </article>
    </div>
  );
}
