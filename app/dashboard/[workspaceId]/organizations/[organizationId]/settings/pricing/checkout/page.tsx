import { redirect } from "next/navigation";
import { listPlans } from "@/lib/services/platform/plan-service";
import { createSubscription } from "@/lib/services/platform/subscription-service";
import { listOrganizationClients } from "@/lib/services/platform/client-service";
import { requireSessionUser } from "@/lib/auth/session-manager";

interface CheckoutPageProps {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<Record<string, string>>;
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { workspaceId, organizationId } = await params;
  const resolvedParams = await searchParams;
  
  const user = await requireSessionUser();
  const workspaceUserEmail = user.email;

  const clientsList = await listOrganizationClients().catch(() => []);
  const matchedClient = clientsList.find((c: any) => 
    String(c.id) === String(organizationId) || 
    String(c._id) === String(organizationId) || 
    String(c.organizationId) === String(organizationId) ||
    String(c.organization_id) === String(organizationId)
  );

  const organizationName = 
    matchedClient?.organizationName || 
    matchedClient?.organization_name || 
    matchedClient?.name || 
    resolvedParams.organizationName || 
    resolvedParams.orgName ||
    "Organization Account";

  const allPlans = await listPlans();
  const planIds = Object.entries(resolvedParams)
    .filter(([key]) => key !== "success" && key !== "organizationName" && key !== "orgName")
    .map(([_, value]) => value);

  const selectedPlans = allPlans.filter((p) => planIds.includes(p.id));

  const monthlySubtotal = selectedPlans.reduce((sum, p) => sum + (p.price ? Number(p.price) : 0), 0);
  const yearlySubtotal = monthlySubtotal * 12;
  const gstAmount = yearlySubtotal * 0.18;
  const totalPrice = yearlySubtotal + gstAmount;

  async function confirmOfflinePaymentAction() {
    "use server";

    const startDate = new Date().toISOString().split("T")[0];
    const expireDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    for (const plan of selectedPlans) {
      const businessTypeId = String(
        plan.businessTypeId || 
        (plan as any).business_type_id || 
        (plan as any).businessType || 
        ""
      ).trim();

      try {
        await createSubscription({
          organizationId,
          organization_name: organizationName, // Inserts into your new column
          organizationName: organizationName,   // Kept for backward compatibility if needed
          workspaceUserEmail,
          businessTypeId,
          planId: plan.id,
          startDate,
          expireDate,
          paymentType: "Offline",
          paymentStatus: "pending",
          payment_status: "pending",
          serviceStatus: "inactive",
          service_status: "inactive",
          status: "inactive",
        } as any);
      } catch {
        // Handle or ignore duplicate subscription error if necessary
      }
    }

    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <p className="erp-eyebrow">Billing</p>
        <h1 className="text-2xl font-bold text-slate-900">Complete Your Payment</h1>
        <p className="text-sm text-slate-600 mt-0.5">Review your selected modules and proceed to secure checkout.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-800">Selected Modules Summary (Yearly + 18% GST)</h2>
          <div className="text-right text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{organizationName}</span>
            <span className="block text-[11px] text-slate-400">{workspaceUserEmail}</span>
          </div>
        </div>
        
        <div className="space-y-3">
          {selectedPlans.map((plan) => (
            <div key={plan.id} className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">{plan.plan_name}</span>
              <span className="font-extrabold text-slate-900">₹{Number(plan.price || 0).toLocaleString("en-IN")} / mo</span>
            </div>
          ))}
          {selectedPlans.length === 0 && (
            <p className="text-xs text-slate-500 italic">No plans selected.</p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Yearly Subtotal (12 months)</span>
            <span className="font-semibold text-slate-800">₹{yearlySubtotal.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between">
            <span>GST (18%)</span>
            <span className="font-semibold text-slate-800">₹{gstAmount.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
          <span className="text-sm font-bold text-slate-800">Total Payable (Yearly + GST)</span>
          <span className="text-xl font-black text-emerald-600">₹{totalPrice.toLocaleString("en-IN")}</span>
        </div>

        <form action={confirmOfflinePaymentAction} className="space-y-2 pt-2">
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Confirm Offline Payment
          </button>
          <button
            type="button"
            className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Online Payment
          </button>
        </form>
      </div>
    </div>
  );
}