"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import FormSubmitButton from "@/components/ui/FormSubmitButton";
import Input from "@/components/ui/Input";

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
  userBasedLicenseCount?: number;
  userBasedMonthlyRate?: number;
  minimumBilledUserCount?: number;
  pricingPlanUrl: string;
  handleCheckoutAction: (formData: FormData) => Promise<void>;
}

const MAX_STANDARD_USER_LICENSES = 10;

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
  userBasedLicenseCount,
  userBasedMonthlyRate = 0,
  minimumBilledUserCount = 0,
  pricingPlanUrl,
  handleCheckoutAction,
}: SubscriptionCheckoutFormProps) {
  const [billingMonths, setBillingMonths] = useState<6 | 12>(defaultBillingMonths);
  const [requestedUserLicenseCount, setRequestedUserLicenseCount] = useState(
    userBasedLicenseCount === undefined ? "" : String(userBasedLicenseCount),
  );
  const parsedUserLicenseCount = Number(requestedUserLicenseCount);
  const isUserLicenseCountValid = userBasedLicenseCount === undefined
    || (/^\d+$/.test(requestedUserLicenseCount)
      && Number.isSafeInteger(parsedUserLicenseCount)
      && parsedUserLicenseCount >= Math.max(minimumBilledUserCount, 1)
      && parsedUserLicenseCount <= MAX_STANDARD_USER_LICENSES);
  const billedUserCount = isUserLicenseCountValid ? parsedUserLicenseCount : 0;
  const monthlySubtotalCents = userBasedLicenseCount !== undefined
    ? Math.round(userBasedMonthlyRate * 100) * billedUserCount
    : plans.reduce((sum, plan) => sum + Math.round(Number(plan.price || 0) * 100), 0);
  const termSubtotalCents = plans.reduce(
    (sum, plan) => sum + Math.round(Number(plan.price || 0) * 100) * billingMonths, 0,
  );
  const userBasedTermSubtotalCents = monthlySubtotalCents * billingMonths;
  const moduleGstCents = plans.reduce((sum, plan) => {
    const lineSubtotalCents = Math.round(Number(plan.price || 0) * 100) * billingMonths;
    return sum + Math.round(lineSubtotalCents * 0.18);
  }, 0);
  const billedTermSubtotalCents = userBasedLicenseCount === undefined
    ? termSubtotalCents
    : userBasedTermSubtotalCents;
  const gstCents = userBasedLicenseCount === undefined
    ? moduleGstCents
    : Math.round(userBasedTermSubtotalCents * 0.18);
  const totalDueCents = billedTermSubtotalCents + gstCents;

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-[var(--erp-brand)] px-6 py-7 text-white sm:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Subscription checkout</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Review and submit</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">Your request remains pending until approval. Renewals begin after the current paid term ends.</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 sm:min-w-48">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/75">Billing for</p>
            <p className="mt-1 text-sm font-bold text-white">{organizationName}</p>
          </div>
        </div>
      </div>

      <div className="space-y-7 p-6 sm:p-8">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-muted)]">
                {userBasedLicenseCount === undefined ? "Selected modules" : "User licenses"}
              </p>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                {userBasedLicenseCount === undefined
                  ? "Monthly pricing before the selected term is applied."
                  : "Set the number of licenses to purchase; the billing estimate updates automatically."}
              </p>
            </div>
            <span className="rounded-full bg-[var(--erp-brand-soft)] px-3 py-1 text-xs font-bold text-[var(--erp-brand)]">
              {userBasedLicenseCount === undefined
                ? `${plans.length} module${plans.length === 1 ? "" : "s"}`
                : `${billedUserCount} license${billedUserCount === 1 ? "" : "s"}`}
            </span>
          </div>
          {userBasedLicenseCount !== undefined ? (
            <div className="space-y-4 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
              <Input
                label="Number of user licenses"
                type="number"
                min={Math.max(minimumBilledUserCount, 1)}
                max={MAX_STANDARD_USER_LICENSES}
                step={1}
                value={requestedUserLicenseCount}
                onChange={(event) => setRequestedUserLicenseCount(event.target.value)}
                hint={`${minimumBilledUserCount} active organization member${minimumBilledUserCount === 1 ? "" : "s"} currently require licenses.`}
                error={!isUserLicenseCountValid
                  ? minimumBilledUserCount > MAX_STANDARD_USER_LICENSES
                    ? "Your organization has more than 10 active users. Contact support for better pricing."
                    : parsedUserLicenseCount > MAX_STANDARD_USER_LICENSES
                      ? "For more than 10 users, contact support for better pricing."
                      : `Enter a whole number from ${Math.max(minimumBilledUserCount, 1)} to ${MAX_STANDARD_USER_LICENSES}.`
                  : undefined}
              />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--erp-muted)]">
                  {billedUserCount} licenses × {money(userBasedMonthlyRate)} / license / month
                </span>
                <span className="shrink-0 font-semibold text-[var(--erp-text)]">{money(monthlySubtotalCents / 100)} / month</span>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--erp-border)] rounded-xl border border-[var(--erp-border)]">
              {plans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <span className="text-sm font-semibold text-[var(--erp-text)]">{plan.plan_name}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[var(--erp-text)]">{money(Number(plan.price || 0))}<span className="ml-1 text-xs font-normal text-[var(--erp-muted)]">/ month</span></span>
                    <span className="mt-1 block text-[11px] text-[var(--erp-muted)]">
                      {formatDate(new Date(plan.projectedStartDate))} to {formatDate(addBillingMonths(new Date(plan.projectedStartDate), billingMonths))} (estimated)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-muted)]">Choose billing term</p>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">Each term starts on approval or after its current paid term ends.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[6, 12].map((months) => {
              const selected = billingMonths === months;
              return (
                <Button
                  key={months}
                  type="button"
                  variant={selected ? "outline" : "secondary"}
                  size="lg"
                  onClick={() => setBillingMonths(months as 6 | 12)}
                  aria-pressed={selected}
                  className={`h-auto flex-col items-start justify-center rounded-xl px-4 py-4 text-left ${selected ? "bg-[var(--erp-brand-soft)]" : ""}`}
                >
                  <span className="block text-sm font-bold">{months} months</span>
                  <span className="mt-1 block text-xs font-normal text-[var(--erp-muted)]">{months === 6 ? "Shorter commitment" : "Best annual value"}</span>
                </Button>
              );
            })}
          </div>
          <p className="mt-3 rounded-xl bg-[var(--erp-surface-soft)] px-4 py-3 text-xs text-[var(--erp-muted)]">
            Final dates are recalculated when an administrator approves the request.
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-muted)]">Amount summary</p>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">Tax is calculated at 18% on the selected term subtotal.</p>
            </div>
            <span className="text-xl font-bold text-[var(--erp-text)]">{money(totalDueCents / 100)}</span>
          </div>
          <div className="mt-5 space-y-3 border-t border-[var(--erp-border)] pt-4 text-sm">
            <div className="flex justify-between text-[var(--erp-muted)]"><span>Monthly subtotal</span><span>{money(monthlySubtotalCents / 100)}</span></div>
            <div className="flex justify-between text-[var(--erp-muted)]"><span>{billingMonths}-month subtotal</span><span>{money(billedTermSubtotalCents / 100)}</span></div>
            <div className="flex justify-between text-[var(--erp-muted)]"><span>GST (18%)</span><span>{money(gstCents / 100)}</span></div>
            <div className="flex justify-between border-t border-[var(--erp-border)] pt-3 font-bold text-[var(--erp-text)]"><span>Total amount due</span><span className="text-[var(--erp-brand)]">{money(totalDueCents / 100)}</span></div>
          </div>
        </section>

        <form action={handleCheckoutAction} className="flex flex-col-reverse gap-3 border-t border-[var(--erp-border)] pt-5 sm:flex-row sm:justify-end">
          <input type="hidden" name="billingMonths" value={billingMonths} />
          {userBasedLicenseCount !== undefined && (
            <input type="hidden" name="billedUserCount" value={requestedUserLicenseCount} />
          )}
          <Link href={pricingPlanUrl} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--erp-border)] px-4 py-2 text-sm font-semibold text-[var(--erp-text)] hover:bg-[var(--erp-surface-soft)]">Back to plans</Link>
          <FormSubmitButton
            pendingLabel="Submitting request..."
            disabled={!isUserLicenseCountValid}
          >
            Submit for approval
          </FormSubmitButton>
        </form>
      </div>
    </Card>
  );
}
