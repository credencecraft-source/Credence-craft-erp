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
  if (versionName !== toUrlSegment(version.version_name) || businessTypeName !== toUrlSegment(entry.businessType.name) || segmentName !== toSegmentUrlSegment(assignment.segment.name)) {
    redirect(`/platform/versions/${version.id}`);
  }

  const canonicalPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}/${toSegmentUrlSegment(assignment.segment.name)}`;

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">{version.version_name} / {entry.businessType.name}</p>
            <h1 className="text-2xl font-bold text-slate-900">{assignment.segment.name.toUpperCase()} restrictions</h1>
            <p className="text-sm text-slate-600">Choose the restriction type to configure for this business type segment.</p>
          </div>
          <Link href={canonicalPath.split("/").slice(0, -1).join("/")} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Back to {entry.businessType.name}
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`${canonicalPath}/modulesbased-restriction`}>
            <Card className="h-full border-emerald-200 p-5 transition-colors hover:bg-emerald-50/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Restriction type 01</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Module-based restrictions</h2>
              <p className="mt-2 text-sm text-slate-600">Manage module, submodule, action, and route access for this segment.</p>
              <span className="mt-5 inline-block text-sm font-semibold text-emerald-700">Open module restrictions</span>
            </Card>
          </Link>
          <Link href={`${canonicalPath}/transactionbased-restriction`}>
            <Card className="h-full border-violet-200 p-5 transition-colors hover:bg-violet-50/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Restriction type 02</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Transaction-based restrictions</h2>
              <p className="mt-2 text-sm text-slate-600">Set monthly transaction entry limits for this segment.</p>
              <span className="mt-5 inline-block text-sm font-semibold text-violet-700">Open transaction restrictions</span>
            </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}