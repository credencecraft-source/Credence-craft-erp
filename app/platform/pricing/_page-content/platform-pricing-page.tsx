import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getPlatformPricingSettings, updatePlatformPricingSettings, type PricingMode } from "@/lib/services/platform/pricing-mode-service";

export default async function PlatformPricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const [admin, settings, query] = await Promise.all([
    requirePlatformSessionAdmin(),
    getPlatformPricingSettings(),
    searchParams ?? Promise.resolve({} as { error?: string; success?: string }),
  ]);

  async function updateModeAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const mode = String(formData.get("mode") || "") as PricingMode;
    const isActive = String(formData.get("isActive") || "") === "true";
    try {
      await updatePlatformPricingSettings({ mode, isActive });
    } catch (error) {
      redirect(`/platform/pricing?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update pricing mode.")}`);
    }
    redirect("/platform/pricing?success=Pricing%20mode%20updated.");
  }

  const pricingOptions: Array<{ mode: PricingMode; label: string; description: string; active: boolean; href: string }> = [
    {
      mode: "MODULE_BASED",
      label: "Module Based Pricing",
      description: "Charge organizations by business type and selected version segment.",
      active: settings.module_based_active,
      href: "/platform/plan/dashboard/module%20pricing",
    },
  ];

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform / Price</p>
          <h1 className="text-2xl font-bold text-slate-900">Pricing Types</h1>
          <p className="mt-1 text-sm text-slate-600">Enable the pricing models available for organizations.</p>
        </div>
        {query.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
        {query.success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{query.success}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {pricingOptions.map((option) => (
            <Card key={option.mode} className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{option.label}</h2>
                  <p className="mt-1 text-sm text-slate-600">{option.description}</p>
                </div>
                <Badge>{option.active ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <a href={option.href} className="text-sm font-semibold text-[var(--erp-brand)] hover:underline">
                  Configure module pricing
                </a>
                <form action={updateModeAction}>
                  <input type="hidden" name="mode" value={option.mode} />
                  <input type="hidden" name="isActive" value={String(!option.active)} />
                  <Button type="submit" variant={option.active ? "secondary" : "primary"} size="sm">
                    {option.active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
        <p className="text-xs text-slate-500">Updated by platform admin {admin.full_name}. Pricing mode changes do not remove the organization’s version-based feature restrictions.</p>
      </Section>
    </Page>
  );
}
