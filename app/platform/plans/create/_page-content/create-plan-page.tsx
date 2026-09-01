import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { createPlan } from "@/lib/services/platform/plan-service";

export default async function CreatePlanPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const params = (await searchParams) ?? {};

  async function createPlanAction(formData: FormData) {
    "use server";

    const planName = String(formData.get("planName") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const priceRaw = String(formData.get("price") || "").trim();
    const billingCycle = String(formData.get("billingCycle") || "").trim();

    try {
      await createPlan({
        planName,
        description,
        price: priceRaw ? Number(priceRaw) : undefined,
        billingCycle,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create plan.";
      redirect(`/platform/plans/create?error=${encodeURIComponent(message)}`);
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
            <Input label="Plan name" name="planName" required placeholder="Enterprise" />
            <Input label="Description" name="description" placeholder="Full access for large organizations." />
            <Input label="Price" name="price" type="number" step="0.01" placeholder="0" />
            <Input label="Billing cycle" name="billingCycle" placeholder="monthly" />

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
