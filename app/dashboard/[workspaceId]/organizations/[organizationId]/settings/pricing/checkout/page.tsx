import { listPlans } from "@/lib/services/platform/plan-service";

interface CheckoutPageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const resolvedParams = await searchParams;
  const allPlans = await listPlans();

  const selectedPlanIds = Object.values(resolvedParams);
  const selectedPlans = allPlans.filter((p) => selectedPlanIds.includes(p.id));

  const totalPrice = selectedPlans.reduce((sum, p) => sum + (p.price ? Number(p.price) : 0), 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <p className="erp-eyebrow">Billing</p>
        <h1 className="text-2xl font-bold text-slate-900">Complete Your Payment</h1>
        <p className="text-sm text-slate-600 mt-0.5">Review your selected modules and proceed to secure checkout.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3">Selected Modules Summary</h2>
        
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

        <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
          <span className="text-sm font-bold text-slate-800">Total Payable</span>
          <span className="text-xl font-black text-emerald-600">₹{totalPrice.toLocaleString("en-IN")} / mo</span>
        </div>

        <button className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors cursor-pointer">
          Proceed to Secure Payment
        </button>
      </div>
    </div>
  );
}