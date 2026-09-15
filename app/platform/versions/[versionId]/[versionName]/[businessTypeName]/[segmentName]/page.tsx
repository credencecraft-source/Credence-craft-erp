import Link from "next/link";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { getVersionDetails } from "@/lib/services/platform/version-service";

function toUrlSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toSegmentUrlSegment(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default async function VersionBusinessTypeSegmentPage({
  params,
}: {
  params: Promise<{ versionId: string; versionName: string; businessTypeName: string; segmentName: string }>;
}) {
  const { versionId, versionName, businessTypeName, segmentName } = await params;
  const version = await getVersionDetails(versionId);
  const entry = version?.businessTypes.find((item) => toUrlSegment(item.businessType.name) === businessTypeName);
  const assignment = entry?.segments.find((item) => toSegmentUrlSegment(item.segment.name) === segmentName);

  if (!version || !entry || !assignment) redirect(`/platform/versions/${versionId}`);

  const canonicalPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}/${toSegmentUrlSegment(assignment.segment.name)}`;
  if (versionName !== toUrlSegment(version.version_name) || businessTypeName !== toUrlSegment(entry.businessType.name) || segmentName !== toSegmentUrlSegment(assignment.segment.name)) redirect(canonicalPath);
  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="erp-eyebrow">{version.version_name} / {entry.businessType.name}</p><h1 className="text-2xl font-bold text-slate-900">{assignment.segment.name.toUpperCase()}</h1><p className="text-sm text-slate-600">Segment details for {entry.businessType.name} in version {version.version_name}.</p></div>
          <Link href={`/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to segments</Link>
        </div>
        <Card className="p-6"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Segment</p><h2 className="mt-2 text-xl font-bold text-slate-900">{assignment.segment.name.toUpperCase()}</h2><p className="mt-3 text-sm text-slate-600">{assignment.segment.description || "No description has been configured for this segment yet."}</p><div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Version</p><p className="mt-1 font-semibold text-slate-900">{version.version_name}</p></div><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Business Type</p><p className="mt-1 font-semibold text-slate-900">{entry.businessType.name}</p></div></div></Card>
        <div className="grid gap-5 md:grid-cols-2">
          <Link href={`${canonicalPath}/modulesbased-restriction`}>
            <Card className="h-full p-6 transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Restriction type 01</p><h2 className="mt-2 text-xl font-bold text-slate-900">Modules based restriction</h2><p className="mt-2 text-sm text-slate-600">Control access to the left-side ERP modules, submodules, and actions for this segment.</p><span className="mt-6 inline-block text-sm font-semibold text-emerald-700">Manage module restrictions →</span></Card>
          </Link>
          <Card className="h-full border-dashed p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Restriction type 02</p><h2 className="mt-2 text-xl font-bold text-slate-900">Transaction based restriction</h2><p className="mt-2 text-sm text-slate-600">Control transaction-level limits and workflows for this segment.</p><span className="mt-6 inline-block text-sm font-semibold text-slate-400">Coming next</span></Card>
        </div>
      </Section>
    </Page>
  );
}