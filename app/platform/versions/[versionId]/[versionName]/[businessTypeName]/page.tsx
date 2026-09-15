import Link from "next/link";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getVersionDetails, setVersionBusinessTypeSegmentActive } from "@/lib/services/platform/version-service";

function toUrlSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default async function VersionBusinessTypeSegmentsPage({
  params,
}: {
  params: Promise<{ versionId: string; versionName: string; businessTypeName: string }>;
}) {
  const { versionId, versionName, businessTypeName } = await params;
  const version = await getVersionDetails(versionId);
  const entry = version?.businessTypes.find((item) => item.businessType && toUrlSegment(item.businessType.name) === businessTypeName);

  if (!version || !entry) redirect(`/platform/versions/${versionId}`);

  const canonicalPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}`;
  if (versionName !== toUrlSegment(version.version_name)) redirect(canonicalPath);

  function segmentUrlSegment(value: string) {
    return encodeURIComponent(value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  const enabledSegmentCount = entry.segments.filter((assignment) => assignment.is_active).length;

  async function toggleSegmentAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    await setVersionBusinessTypeSegmentActive(
      String(formData.get("assignmentId") || ""),
      String(formData.get("isActive") || "false") === "true",
    );
    redirect(canonicalPath);
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="erp-eyebrow">{version.version_name} / Business Type</p><h1 className="text-2xl font-bold text-slate-900">{entry.businessType.name}</h1><p className="text-sm text-slate-600">Configure the segments available for this business type inside version {version.version_name}.</p></div>
          <Link href={`/platform/versions/${version.id}`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to {version.version_name}</Link>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Segments</h2><p className="mt-1 text-sm text-slate-500">Enable a segment to make it available in organization pricing.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{enabledSegmentCount}/{entry.segments.length} enabled</span></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entry.segments.map((assignment) => <Card key={assignment.id} className={`h-full p-5 ${assignment.is_active ? "border-emerald-200" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <Link href={`${canonicalPath}/${segmentUrlSegment(assignment.segment.name)}`} className="min-w-0 flex-1 transition-colors hover:text-emerald-700">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Version segment</p>
                  <h2 className="mt-2 text-lg font-bold text-slate-900">{assignment.segment.name.toUpperCase()}</h2>
                  <p className="mt-2 text-sm text-slate-500">{assignment.segment.description || "Open segment details"}</p>
                </Link>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${assignment.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                  {assignment.is_active ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <Link href={`${canonicalPath}/${segmentUrlSegment(assignment.segment.name)}`} className="text-sm font-semibold text-emerald-700">Open segment</Link>
                <form action={toggleSegmentAction}>
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <input type="hidden" name="isActive" value={String(!assignment.is_active)} />
                  <button type="submit" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${assignment.is_active ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                    {assignment.is_active ? "Disable" : "Enable"}
                  </button>
                </form>
              </div>
            </Card>)}
            {entry.segments.length === 0 && <Card className="p-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">No segments are configured for this business type.</Card>}
          </div>
        </div>
      </Section>
    </Page>
  );
}