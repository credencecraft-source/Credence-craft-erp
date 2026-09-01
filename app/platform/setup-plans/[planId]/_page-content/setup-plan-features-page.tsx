import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getPlanById, listPlanFeatures, setPlanFeatureEnabled } from "@/lib/services/platform/plan-service";

export default async function SetupPlanFeaturesPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  await requirePlatformSessionAdmin();
  const { planId } = await params;
  const plan = await getPlanById(planId);

  if (!plan) {
    notFound();
  }

  const features = await listPlanFeatures(planId);

  async function toggleFeatureAction(formData: FormData) {
    "use server";

    const featureKey = String(formData.get("featureKey") || "");
    const nextEnabled = String(formData.get("nextEnabled") || "") === "true";

    await setPlanFeatureEnabled(planId, featureKey, nextEnabled);
    redirect(`/platform/setup-plans/${planId}`);
  }

  return (
    <Page className="max-w-3xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">{plan.plan_name} features</h1>
          <p className="text-sm text-slate-600">
            Toggle which ERP features are available to organizations on this plan.
          </p>
        </div>

        <Card className="divide-y divide-slate-100 p-0">
          {features.map((feature) => (
            <form
              key={feature.feature_key}
              action={toggleFeatureAction}
              className="flex items-center justify-between px-5 py-3"
            >
              <input type="hidden" name="featureKey" value={feature.feature_key} />
              <input type="hidden" name="nextEnabled" value={(!feature.is_enabled).toString()} />
              <span className="text-sm font-medium text-slate-800">{feature.feature_name}</span>
              <button type="submit" className="cursor-pointer border-none bg-transparent p-0">
                <Badge className={feature.is_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                  {feature.is_enabled ? "Enabled" : "Disabled"}
                </Badge>
              </button>
            </form>
          ))}
        </Card>
      </Section>
    </Page>
  );
}
