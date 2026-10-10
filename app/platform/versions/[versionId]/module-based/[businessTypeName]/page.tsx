import Link from "next/link";
import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import VersionBusinessTypeAudienceTags from "@/app/platform/versions/_components/version-business-type-audience-tags";
import { listPlatformTags } from "@/lib/services/platform/platform-tag-service";
import { assignVersionBusinessTypeTag, removeVersionBusinessTypeTag } from "@/lib/services/platform/version-business-type-tag-service";
import { getVersionDetails, setVersionBusinessTypeSegmentActive, setVersionBusinessTypeSegmentPrice } from "@/lib/services/platform/version-service";
import {
  getErpBusinessTypeDisplayName,
  getErpBusinessTypeRouteSegment,
  isErpBusinessTypeRouteSegment,
} from "@/components/erp/erp-config-registry";

function toUrlSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toSegmentUrlSegment(value: string) {
  return encodeURIComponent(value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""));
}

export default async function ModuleBasedBusinessTypePage({
  params,
}: {
  params: Promise<{ versionId: string; businessTypeName: string }>;
}) {
  const { versionId, businessTypeName } = await params;
  const [version, platformTags] = await Promise.all([getVersionDetails(versionId), listPlatformTags()]);
  const entry = version?.businessTypes.find((item) => item.businessType && isErpBusinessTypeRouteSegment(item.businessType.name, businessTypeName));

  if (!version || !entry) redirect(`/platform/versions/${versionId}/module-based`);

  const modulePath = `/platform/versions/${version.id}/module-based/${getErpBusinessTypeRouteSegment(entry.businessType.name)}`;
  const existingRestrictionPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${getErpBusinessTypeRouteSegment(entry.businessType.name)}`;
  const versionBusinessTypeId = entry.id;
  const enabledSegmentCount = entry.segments.filter((assignment) => assignment.is_active).length;

  async function toggleSegmentAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    await setVersionBusinessTypeSegmentActive(
      String(formData.get("assignmentId") || ""),
      String(formData.get("isActive") || "false") === "true",
    );
    redirect(modulePath);
  }

  async function savePriceAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    await setVersionBusinessTypeSegmentPrice(
      String(formData.get("assignmentId") || ""),
      String(formData.get("price") || ""),
    );
    redirect(modulePath);
  }

  async function assignTagAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    await assignVersionBusinessTypeTag(versionBusinessTypeId, String(formData.get("platformTagId") || ""));
    redirect(modulePath);
  }

  async function removeTagAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    await removeVersionBusinessTypeTag(String(formData.get("tagId") || ""));
    redirect(modulePath);
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="erp-eyebrow">{version.version_name} / Module-based</p><h1 className="text-2xl font-bold text-slate-900">{getErpBusinessTypeDisplayName(entry.businessType.name)}</h1><p className="text-sm text-slate-600">Configure the segments and pricing access for this business type inside version {version.version_name}.</p></div>
          <Link href={`/platform/versions/${version.id}/module-based`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to module-based</Link>
        </div>

        <VersionBusinessTypeAudienceTags
          tags={entry.tags.map((tag) => ({ id: tag.id, label: tag.platformTag.label, isActive: tag.platformTag.is_active }))}
          availableTags={platformTags
            .filter((tag) => tag.is_active && !entry.tags.some((assignedTag) => assignedTag.platform_tag_id === tag.id))
            .map((tag) => ({ id: tag.id, label: tag.label, isActive: tag.is_active }))}
          addTagAction={assignTagAction}
          removeTagAction={removeTagAction}
        />

        <div>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Segments</h2><p className="mt-1 text-sm text-slate-500">Enable a segment to make it available in organization pricing.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{enabledSegmentCount}/{entry.segments.length} enabled</span></div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <Table>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-3">Segment</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Price / month</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {entry.segments.map((assignment) => (
                  <tr key={assignment.id} className="align-middle hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3"><Link href={`${existingRestrictionPath}/${toSegmentUrlSegment(assignment.segment.name)}`} className="font-semibold text-slate-900 transition-colors hover:text-emerald-700">{assignment.segment.name.toUpperCase()}</Link></td>
                    <td className="min-w-56 px-4 py-3 text-slate-600">{assignment.segment.description || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3"><form action={savePriceAction} className="flex items-center gap-2"><input type="hidden" name="assignmentId" value={assignment.id} /><span className="text-slate-500">INR</span><Input name="price" type="number" min="0" step="0.01" defaultValue={assignment.price?.toString() ?? ""} placeholder="Plan price" className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-800" aria-label={`Price for ${assignment.segment.name}`} /><Button type="submit" size="sm">Save</Button></form></td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${assignment.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{assignment.is_active ? "Enabled" : "Disabled"}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right"><div className="flex justify-end gap-3"><Link href={`${existingRestrictionPath}/${toSegmentUrlSegment(assignment.segment.name)}/modulesbased-restriction`} className="text-xs font-semibold text-emerald-700 hover:underline">Open</Link><form action={toggleSegmentAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="isActive" value={String(!assignment.is_active)} /><Button type="submit" size="sm" variant={assignment.is_active ? "danger" : "primary"}>{assignment.is_active ? "Disable" : "Enable"}</Button></form></div></td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {entry.segments.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No segments are configured for this business type.</p>}
          </div>
        </div>
      </Section>
    </Page>
  );
}
