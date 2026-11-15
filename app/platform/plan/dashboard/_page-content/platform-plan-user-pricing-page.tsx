import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getPlatformPricingSettings, updatePlatformPricingSettings } from "@/lib/services/platform/pricing-mode-service";

export default async function PlatformPlanUserPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [admin, settings, query] = await Promise.all([
    requirePlatformSessionAdmin(),
    getPlatformPricingSettings(),
    searchParams,
  ]);

  async function updateUserRateAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await updatePlatformPricingSettings({
        userMonthlyPrice: String(formData.get("userMonthlyPrice") || ""),
      });
    } catch (error) {
      redirect(`/platform/plan/dashboard/user%20pricing?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update per-user rate.")}`);
    }
    redirect("/platform/plan/dashboard/user%20pricing?success=Per-user%20monthly%20rate%20updated.");
  }

  async function updateModeAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const isActive = String(formData.get("isActive") || "") === "true";
    try {
      await updatePlatformPricingSettings({ mode: "USER_BASED", isActive });
    } catch (error) {
      redirect(`/platform/plan/dashboard/user%20pricing?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update User Based Pricing.")}`);
    }
    redirect(`/platform/plan/dashboard/user%20pricing?success=User%20Based%20Pricing%20${isActive ? "activated" : "deactivated"}.`);
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform / Plan</p>
          <h1 className="text-2xl font-bold text-slate-900">User Based Pricing</h1>
          <p className="mt-1 text-sm text-slate-600">Configure the monthly rate for each active organization member.</p>
        </div>

        {query.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
        {query.success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{query.success}</p>}

        <Card className="space-y-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pricing status</h2>
              <p className="mt-1 text-sm text-slate-600">
                {settings.user_based_active ? "User Based Pricing is active." : "User Based Pricing is inactive."}
              </p>
            </div>
            <form action={updateModeAction}>
              <input type="hidden" name="isActive" value={String(!settings.user_based_active)} />
              <Button type="submit" variant={settings.user_based_active ? "secondary" : "primary"} size="sm">
                {settings.user_based_active ? "Deactivate" : "Activate"}
              </Button>
            </form>
          </div>

          <form action={updateUserRateAction} className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input
              label="Price per active member / month (INR)"
              name="userMonthlyPrice"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={settings.user_monthly_price.toString()}
            />
            <Button type="submit">Save rate</Button>
          </form>
        </Card>

        <p className="text-xs text-slate-500">Updated by platform admin {admin.full_name}. Pricing mode changes do not remove an organization’s version-based feature restrictions.</p>
      </Section>
    </Page>
  );
}
