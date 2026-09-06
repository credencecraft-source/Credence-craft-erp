import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { createPlan, listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";

export default async function CreatePlanPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const params = (await searchParams) ?? {};
  const businessTypes = await listBusinessTypes();

  async function createPlanAction(formData: FormData) {
    "use server";

    const businessTypeId = String(formData.get("businessTypeId") || "").trim();
    const rawPlanName = String(formData.get("planName") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const isFree = formData.get("isFree") === "on";
    const priceRaw = isFree ? "0" : String(formData.get("price") || "").trim();
    const billingCycle = String(formData.get("billingCycle") || "monthly").trim();

    if (isFree && businessTypeId) {
      const allPlans = await listPlans();
      const freePlanExists = allPlans.some(
        (p) => p.business_type_id === businessTypeId && (!p.price || Number(p.price) === 0)
      );
      if (freePlanExists) {
        redirect(`/platform/plans/create?error=${encodeURIComponent("A free plan already exists for this business type.")}`);
      }
    }

    const selectedBt = businessTypes.find((bt) => bt.id === businessTypeId);
    const planName = selectedBt ? `${selectedBt.name} - ${rawPlanName}` : rawPlanName;

    let errorMessage: string | null = null;

    try {
      await createPlan({
        planName,
        businessTypeId: businessTypeId !== "" ? businessTypeId : undefined,
        description,
        price: Number(priceRaw),
        billingCycle,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unable to create plan.";
    }

    if (errorMessage) {
      redirect(`/platform/plans/create?error=${encodeURIComponent(errorMessage)}`);
    }

    redirect("/platform/plans");
  }

  return (
    <Page className="max-w-xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Create plan</h1>
        </div>

        <Card className="p-6">
          <form action={createPlanAction} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Business Type / Category</label>
              <select
                name="businessTypeId"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Select a business type...</option>
                {businessTypes.map((bt) => (
                  <option key={bt.id} value={bt.id}>
                    {bt.name}
                  </option>
                ))}
              </select>
            </div>

            <Input label="Tier / Plan Name" name="planName" required placeholder="Standard or 50K Units" />
            <Input label="Description" name="description" placeholder="Up to 5,000 units and 3 user seats." />
            
            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="isFree"
                name="isFree"
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="isFree" className="text-xs font-semibold text-slate-700">
                This is a free plan (Only one free plan allowed per business type)
              </label>
            </div>

            <Input label="Price" name="price" type="number" step="0.01" placeholder="7000" />
            <Input label="Billing cycle" name="billingCycle" defaultValue="monthly" placeholder="monthly" />

            {params.error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {params.error}
              </p>
            )}

            <Button type="submit" className="w-full">
              Create plan
            </Button>
          </form>
        </Card>
      </Section>
    </Page>
  );
}