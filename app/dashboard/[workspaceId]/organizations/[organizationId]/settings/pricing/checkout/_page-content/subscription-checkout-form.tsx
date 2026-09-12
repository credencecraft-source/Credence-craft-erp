"use client";

import Link from "next/link";
import { useState } from "react";

interface CheckoutPlan {
  id: string;
  plan_name: string;
  price: number | null;
}

interface SubscriptionCheckoutFormProps {
  plans: CheckoutPlan[];
  organizationName: string;
  organizationId: string;
  workspaceId: string;
  monthlySubtotal: number;
  defaultBillingMonths: 6 | 12;
  pricingPlanUrl: string;
  handleCheckoutAction: (formData: FormData) => Promise<void>;
}

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SubscriptionCheckoutForm({
  plans,
  organizationName,
  monthlySubtotal,
  defaultBillingMonths,
  pricingPlanUrl,
  handleCheckoutAction,
}: SubscriptionCheckoutFormProps) {
  const [billingMonths, setBillingMonths] = useState<6 | 12>(defaultBillingMonths);
  const termSubtotal = Number((monthlySubtotal * billingMonths).toFixed(2));
  const gstAmount = Number((termSubtotal * 0.18).toFixed(2));
  const totalAmount = Number((termSubtotal + gstAmount).toFixed(2));
  const projectedExpiry = addMonths(new Date(), billingMonths);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
      <div className="bg-slate-950 px-6 py-7 text-white sm:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Subscription checkout</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Review and submit</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Your request will remain pending until a platform administrator approves it.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 sm:min-w-48">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Billing for</p>
            <p className="mt-1 text-sm font-bold text-white">{organizationName}</p>
          </div>
        </div>
      </div>

      <div className="space-y-7 p-6 sm:p-8">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Selected modules</p>
              <p className="mt-1 text-sm text-slate-600">Monthly pricing before the selected term is applied.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{plans.length} module{plans.length === 1 ? "" : "s"}</span>
          </div>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <span className="text-sm font-semibold text-slate-800">{plan.plan_name}</span>
                <span className="text-sm font-bold text-slate-900">{money(Number(plan.price || 0))}<span className="ml-1 text-xs font-normal text-slate-500">/ month</span></span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Choose billing term</p>
            <p className="mt-1 text-sm text-slate-600">The subscription period starts on approval.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[6, 12].map((months) => {
              const selected = billingMonths === months;
              return (
                <button
                  key={months}
                  type="button"
                  onClick={() => setBillingMonths(months as 6 | 12)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${selected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50"}`}
                >
                  <span className={`block text-sm font-bold ${selected ? "text-emerald-800" : "text-slate-800"}`}>{months} months</span>
                  <span className="mt-1 block text-xs text-slate-500">{months === 6 ? "Shorter commitment" : "Best annual value"}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Projected term: today through <span className="font-bold text-slate-900">{formatDate(projectedExpiry)}</span>. Final dates are set when approved.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Amount summary</p>
              <p className="mt-1 text-sm text-slate-600">Tax is calculated at 18% on the selected term subtotal.</p>
            </div>
            <span className="text-xl font-black text-slate-950">{money(totalAmount)}</span>
          </div>
          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Monthly subtotal</span><span>{money(monthlySubtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>{billingMonths}-month subtotal</span><span>{money(termSubtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>GST (18%)</span><span>{money(gstAmount)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-3 font-bold text-slate-950"><span>Total amount due</span><span className="text-emerald-700">{money(totalAmount)}</span></div>
          </div>
        </section>

        <form action={handleCheckoutAction} className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <input type="hidden" name="billingMonths" value={billingMonths} />
          <Link href={pricingPlanUrl} className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">Back to plans</Link>
          <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700">Submit for approval</button>
        </form>
      </div>
    </div>
  );
}
