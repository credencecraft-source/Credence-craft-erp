import Link from "next/link";
import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { listSegments } from "@/lib/services/platform/segment-service";
import { addSegmentToVersionBusinessType, getVersionDetails, removeSegmentFromVersionBusinessType } from "@/lib/services/platform/version-service";

export default async function VersionBusinessTypeSegmentsPage({ params }: { params: Promise<{ versionId: string; versionBusinessTypeId: string }> }) {
  const { versionId, versionBusinessTypeId } = await params;
  const [version, segments] = await Promise.all([getVersionDetails(versionId), listSegments()]);
  const entry = version?.businessTypes.find((item) => item.id === versionBusinessTypeId);
  if (!version || !entry) redirect(`/platform/versions/${versionId}`);
  const assignedSegmentIds = new Set(entry.segments.map(({ segment_id }) => segment_id));

  async function addAction(formData: FormData) {
    "use server";
    try {
      await addSegmentToVersionBusinessType(versionBusinessTypeId, String(formData.get("segmentId") || ""));
    } catch {
      redirect(`/platform/versions/${versionId}/business-types/${versionBusinessTypeId}`);
    }
    redirect(`/platform/versions/${versionId}/business-types/${versionBusinessTypeId}`);
  }

  async function removeAction(formData: FormData) {
    "use server";
    try {
      await removeSegmentFromVersionBusinessType(String(formData.get("assignmentId") || ""));
    } catch {
      redirect(`/platform/versions/${versionId}/business-types/${versionBusinessTypeId}`);
    }
    redirect(`/platform/versions/${versionId}/business-types/${versionBusinessTypeId}`);
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="erp-eyebrow">{version.version_name} / Business Type</p><h1 className="text-2xl font-bold text-slate-900">{entry.businessType.name}</h1><p className="text-sm text-slate-600">Configure the segments available for this business type inside version {version.version_name}.</p></div>
          <Link href={`/platform/versions/${version.id}`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to {version.version_name}</Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card className="p-6"><h2 className="text-base font-bold text-slate-900">Add a segment</h2><p className="mt-1 text-sm text-slate-500">Choose from the platform segment catalog.</p><form action={addAction} className="mt-5 space-y-4"><select name="segmentId" required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="">Select a segment...</option>{segments.filter((segment) => !assignedSegmentIds.has(segment.id)).map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select><Button type="submit" className="w-full">Assign segment</Button></form></Card>

          <Card className="p-6"><div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Configured segments</h2><p className="mt-1 text-sm text-slate-500">{entry.segments.length} assigned to this business type.</p></div><Link href="/platform/segments" className="text-xs font-semibold text-emerald-700 hover:underline">Manage catalog</Link></div><div className="mt-5 divide-y divide-slate-100">{entry.segments.map((assignment) => <div key={assignment.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{assignment.segment.name}</p><p className="text-xs text-slate-500">{assignment.segment.description || "No description"}</p></div><form action={removeAction}><input type="hidden" name="assignmentId" value={assignment.id} /><button type="submit" className="text-xs font-semibold text-rose-600 hover:underline">Remove</button></form></div>)}{entry.segments.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No segments assigned yet.</p>}</div></Card>
        </div>
      </Section>
    </Page>
  );
}
