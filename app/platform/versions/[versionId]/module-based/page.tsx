import Link from "next/link";
import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getVersionDetails, setVersionBusinessTypeFree } from "@/lib/services/platform/version-service";

function toUrlSegment(value: string) {
  return encodeURIComponent(value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
}

export default async function VersionModuleBasedRestrictionPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  const version = await getVersionDetails(versionId);
  if (!version) redirect("/platform/versions?error=Version%20not%20found");
  const selectedVersion = version;

  async function togglePricingAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    await setVersionBusinessTypeFree(
      String(formData.get("versionBusinessTypeId") || ""),
      String(formData.get("isFree") || "false") === "true",
    );
    redirect(`/platform/versions/${selectedVersion.id}/module-based`);
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">{selectedVersion.version_name} / Module-based restrictions</p>
            <h1 className="text-2xl font-bold text-slate-900">Choose a business type</h1>
            <p className="text-sm text-slate-600">Select a business type to manage its segments and module restrictions.</p>
          </div>
          <Link href={`/platform/versions/${selectedVersion.id}`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to restriction types</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {selectedVersion.businessTypes.map((entry) => (
            <Card key={entry.id} className={`p-5 ${entry.is_free ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
              <Link href={`/platform/versions/${selectedVersion.id}/module-based/${toUrlSegment(entry.businessType.name)}`} className="block transition-colors hover:text-emerald-700">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Business Type</p>
                <h2 className="mt-2 text-lg font-bold text-slate-900">{entry.businessType.name}</h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => <span key={tag.id} className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">{tag.label}</span>)}
                  {entry.tags.length === 0 && <span className="text-xs text-slate-400">No audience tags</span>}
                </div>
                <p className="mt-1 text-sm text-slate-500">{entry.segments.length} segments configured</p>
              </Link>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span className={`text-xs font-semibold ${entry.is_free ? "text-emerald-700" : "text-slate-500"}`}>{entry.is_free ? "Free module" : "Paid module"}</span>
                <form action={togglePricingAction}>
                  <input type="hidden" name="versionBusinessTypeId" value={entry.id} />
                  <input type="hidden" name="isFree" value={String(!entry.is_free)} />
                  <Button type="submit" size="sm" variant={entry.is_free ? "secondary" : "primary"}>
                    {entry.is_free ? "Mark as paid" : "Make free"}
                  </Button>
                </form>
              </div>
            </Card>
          ))}
          {selectedVersion.businessTypes.length === 0 && <Card className="p-8 text-center text-sm text-slate-500 md:col-span-2 lg:col-span-3">No active business types were available when this version was created.</Card>}
        </div>
      </Section>
    </Page>
  );
}