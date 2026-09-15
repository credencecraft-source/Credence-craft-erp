import Link from "next/link";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { getVersionDetails } from "@/lib/services/platform/version-service";

function toUrlSegment(value: string) {
  return encodeURIComponent(value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
}

export default async function VersionDetailPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const version = await getVersionDetails(versionId);
  if (!version) redirect("/platform/versions?error=Version%20not%20found");

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="erp-eyebrow">Version Configuration</p><h1 className="text-2xl font-bold text-slate-900">{version.version_name}</h1><p className="text-sm text-slate-600">Choose a business type to manage its segments for this version.</p></div>
          <Link href="/platform/versions" className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to versions</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {version.businessTypes.map((entry) => (
            <Link key={entry.id} href={`/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Business Type</p>
              <h2 className="mt-2 text-lg font-bold text-slate-900">{entry.businessType.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{entry.segments.length} segments configured</p>
              <span className="mt-5 inline-block text-sm font-semibold text-emerald-700">Manage segments →</span>
            </Link>
          ))}
          {version.businessTypes.length === 0 && <Card className="p-8 text-center text-sm text-slate-500 md:col-span-2 lg:col-span-3">No active business types were available when this version was created.</Card>}
        </div>
      </Section>
    </Page>
  );
}
