import Link from "next/link";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { RestrictionForm } from "@/components/platform/restriction-form";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getVersionDetails } from "@/lib/services/platform/version-service";
import { createSegmentRestriction, deleteSegmentRestriction, listSegmentRestrictions } from "@/lib/services/platform/segment-restriction-service";

function toUrlSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toSegmentUrlSegment(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default async function ModulesBasedRestrictionPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string; versionName: string; businessTypeName: string; segmentName: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const { versionId, versionName, businessTypeName, segmentName } = await params;
  const query = (await searchParams) ?? {};
  const version = await getVersionDetails(versionId);
  const entry = version?.businessTypes.find((item) => toUrlSegment(item.businessType.name) === businessTypeName);
  const assignment = entry?.segments.find((item) => toSegmentUrlSegment(item.segment.name) === segmentName);

  if (!version || !entry || !assignment) redirect(`/platform/versions/${versionId}`);

  const canonicalPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}/${toSegmentUrlSegment(assignment.segment.name)}/modulesbased-restriction`;
  if (versionName !== toUrlSegment(version.version_name) || businessTypeName !== toUrlSegment(entry.businessType.name) || segmentName !== toSegmentUrlSegment(assignment.segment.name)) redirect(canonicalPath);

  const versionBusinessTypeSegmentId = assignment.id;
  const restrictions = await listSegmentRestrictions(versionBusinessTypeSegmentId);
  const segmentPath = canonicalPath.replace("/modulesbased-restriction", "");

  async function saveRestrictionAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await createSegmentRestriction(versionBusinessTypeSegmentId, {
        masterModule: String(formData.get("masterModule") || ""),
        mainModule: String(formData.get("mainModule") || ""),
        subModule: String(formData.get("subModule") || ""),
        actionLevel: String(formData.get("actionLevel") || "*"),
        restrictionType: String(formData.get("restrictionType") || "block"),
        customMessage: String(formData.get("customMessage") || ""),
      });
    } catch (error) {
      redirect(`${canonicalPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save restriction.")}`);
    }
    redirect(`${canonicalPath}?success=Restriction%20saved.`);
  }

  async function deleteRestrictionAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await deleteSegmentRestriction(String(formData.get("restrictionId") || ""));
    } catch (error) {
      redirect(`${canonicalPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete restriction.")}`);
    }
    redirect(`${canonicalPath}?success=Restriction%20removed.`);
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="erp-eyebrow">{version.version_name} / {entry.businessType.name} / {assignment.segment.name.toUpperCase()}</p><h1 className="text-2xl font-bold text-slate-900">Modules based restriction</h1><p className="text-sm text-slate-600">Restrict the left-side ERP modules and their nested features for this segment.</p></div>
          <Link href={segmentPath} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to restriction types</Link>
        </div>

        {query.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
        {query.success && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{query.success}</p>}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card className="p-6"><h2 className="text-base font-bold text-slate-900">Add module restriction</h2><p className="mt-1 text-sm text-slate-500">Rules apply only to this version, business type, and segment.</p><div className="mt-5"><RestrictionForm cancelHref={canonicalPath} saveAction={saveRestrictionAction} /></div></Card>
          <Card className="p-6"><h2 className="text-base font-bold text-slate-900">Configured module restrictions</h2><div className="mt-4 overflow-x-auto"><Table><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Module path</th><th className="px-3 py-3">Message</th><th className="px-3 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100 text-xs">{restrictions.map((restriction) => <tr key={restriction.restriction_id}><td className="px-3 py-3 font-semibold text-slate-900">{restriction.master_module} / {restriction.main_module} / {restriction.sub_module}</td><td className="px-3 py-3 text-slate-600">{restriction.custom_message}</td><td className="px-3 py-3"><form action={deleteRestrictionAction}><input type="hidden" name="restrictionId" value={restriction.restriction_id} /><button type="submit" className="font-semibold text-rose-600 hover:underline">Remove</button></form></td></tr>)}{restrictions.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-500">No module restrictions configured.</td></tr>}</tbody></Table></div></Card>
        </div>
      </Section>
    </Page>
  );
}
