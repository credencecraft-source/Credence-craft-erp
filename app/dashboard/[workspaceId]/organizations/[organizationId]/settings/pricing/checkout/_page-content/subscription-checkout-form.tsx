"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import FormSubmitButton from "@/components/ui/FormSubmitButton";

interface CheckoutPlan {
  id: string;
  plan_name: string;
  price: number | null;
  projectedStartDate: string;
}

interface SubscriptionCheckoutFormProps {
  plans: CheckoutPlan[];
  organizationName: string;
  defaultBillingMonths: 6 | 12;
  pricingPlanUrl: string;
  handleCheckoutAction: (formData: FormData) => Promise<void>;
}

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addBillingMonths(date: Date, months: number) {
  const result = new Date(date);
  const targetMonth = result.getUTCMonth() + months;
  const targetYear = result.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  result.setUTCDate(1);
  result.setUTCFullYear(targetYear, normalizedMonth, Math.min(date.getUTCDate(), lastDay));
  return result;
}

export default function SubscriptionCheckoutForm({
  plans,
  organizationName,
  defaultBillingMonths,
  pricingPlanUrl,
  handleCheckoutAction,
}: SubscriptionCheckoutFormProps) {
  const [billingMonths, setBillingMonths] = useState<6 | 12>(defaultBillingMonths);
  const monthlySubtotalCents = plans.reduce((sum, plan) => sum + Math.round(Number(plan.price || 0) * 100), 0);
  const termSubtotalCents = plans.reduce(
    (sum, plan) => sum + Math.round(Number(plan.price || 0) * 100) * billingMonths,
    0,
  );
  const gstCents = plans.reduce((sum, plan) => {
    const lineSubtotalCents = Math.round(Number(plan.price || 0) * 100) * billingMonths;
    return sum + Math.round(lineSubtotalCents * 0.18);
  }, 0);
  const totalCents = termSubtotalCents + gstCents;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
      <div className="bg-slate-950 px-6 py-7 text-white sm:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Subscription checkout</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Review and submit</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Your request remains pending until approval. Renewals begin after the current paid term ends.</p>
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
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-900">{money(Number(plan.price || 0))}<span className="ml-1 text-xs font-normal text-slate-500">/ month</span></span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {formatDate(new Date(plan.projectedStartDate))} to {formatDate(addBillingMonths(new Date(plan.projectedStartDate), billingMonths))} (estimated)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Choose billing term</p>
            <p className="mt-1 text-sm text-slate-600">Each term starts on approval or after its current paid term ends.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[6, 12].map((months) => {
              const selected = billingMonths === months;
              return (
                <Button
                  key={months}
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => setBillingMonths(months as 6 | 12)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${selected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50"}`}
                >
                  <span className={`block text-sm font-bold ${selected ? "text-emerald-800" : "text-slate-800"}`}>{months} months</span>
                  <span className="mt-1 block text-xs text-slate-500">{months === 6 ? "Shorter commitment" : "Best annual value"}</span>
                </Button>
              );
            })}
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Final dates are recalculated when an administrator approves the request.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Amount summary</p>
              <p className="mt-1 text-sm text-slate-600">Tax is calculated at 18% on the selected term subtotal.</p>
            </div>
            <span className="text-xl font-black text-slate-950">{money(totalCents / 100)}</span>
          </div>
          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Monthly subtotal</span><span>{money(monthlySubtotalCents / 100)}</span></div>
            <div className="flex justify-between text-slate-600"><span>{billingMonths}-month subtotal</span><span>{money(termSubtotalCents / 100)}</span></div>
            <div className="flex justify-between text-slate-600"><span>GST (18%)</span><span>{money(gstCents / 100)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-3 font-bold text-slate-950"><span>Total amount due</span><span className="text-emerald-700">{money(totalCents / 100)}</span></div>
          </div>
        </section>

        <form action={handleCheckoutAction} className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <input type="hidden" name="billingMonths" value={billingMonths} />
          <Link href={pricingPlanUrl} className="rounded-xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">Back to plans</Link>
          <FormSubmitButton pendingLabel="Submitting request..." className="rounded-xl px-5 py-3 text-sm font-bold shadow-lg shadow-emerald-600/20 disabled:cursor-wait disabled:opacity-70">
            Submit for approval
          </FormSubmitButton>
        </form>
      </div>
    </div>
  );
}
