import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listOrganizationClients } from "@/lib/services/platform/client-service";
import { getPlanById } from "@/lib/services/platform/plan-service";
import { createSubscription } from "@/lib/services/platform/subscription-service";

interface PageProps {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
  searchParams?: Promise<{
    planId?: string;
    billingCycle?: string;
    error?: string;
  }>;
}

export default async function CheckoutPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearch = (await searchParams) ?? {};
  
  const workspaceId = resolvedParams?.workspaceId;
  const organizationId = resolvedParams?.organizationId;
  const planId = resolvedSearch?.planId;
  const billingCycle = resolvedSearch?.billingCycle || "yearly";

  const [clients, plan] = await Promise.all([
    listOrganizationClients(),
    planId ? getPlanById(planId) : Promise.resolve(null),
  ]);

  const client = clients.find((c: any) => String(c.id || c._id) === organizationId);

  const orgName = (client as any)?.organization_name || (client as any)?.organizationName || (client as any)?.name || "Unnamed Organization";
  const planName = (plan as any)?.plan_name || (plan as any)?.name || "Selected Plan";
  const planPrice = Number((plan as any)?.price || (plan as any)?.amount || 0);

  const gstAmount = Math.round(planPrice * 0.18);
  const totalAmount = planPrice + gstAmount;

  async function handleCheckoutAction() {
    "use server";

    if (!organizationId || !planId) {
      redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing?error=${encodeURIComponent("Missing organization or plan ID.")}`);
    }

    try {
      await createSubscription({
        organizationId,
        organizationName: orgName,
        organization_name: orgName,
        businessTypeId: (plan as any)?.businessTypeId || (plan as any)?.business_type_id || "",
        business_type_id: (plan as any)?.businessTypeId || (plan as any)?.business_type_id || "",
        planId,
        plan_id: planId,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        expireDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        paymentStatus: "pending",
        payment_status: "pending",
        serviceStatus: "active",
        service_status: "active",
      } as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process checkout subscription.";
      redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/checkout?planId=${planId}&error=${encodeURIComponent(message)}`);
    }

    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan?success=${encodeURIComponent("Subscription created successfully.")}`);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Checkout</p>
        <h1 className="text-2xl font-bold text-slate-900">Confirm Your Subscription</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Review your order details and complete activation for <span className="font-semibold text-slate-900">{orgName}</span>.
        </p>
      </div>

      {resolvedSearch.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">{resolvedSearch.error}</p>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="border-b border-slate-100 pb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Organization:</span>
            <span className="font-bold text-slate-900">{orgName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Selected Plan:</span>
            <span className="font-semibold text-emerald-700">{planName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Billing Cycle:</span>
            <span className="font-medium text-slate-800 capitalize">{billingCycle}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Plan Subtotal</span>
            <span className="font-medium">₹{planPrice.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>GST (18%)</span>
            <span className="font-medium">₹{gstAmount.toLocaleString("en-IN")}</span>
          </div>
          <div className="border-t border-slate-100 pt-3 flex justify-between text-sm font-bold text-slate-900">
            <span>Total Amount Due</span>
            <span className="text-emerald-700">₹{totalAmount.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing`}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Link>
          <form action={handleCheckoutAction}>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Confirm & Activate
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}