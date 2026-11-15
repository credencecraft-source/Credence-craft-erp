import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listInventoryLocationLimits, saveInventoryLocationLimits } from "@/lib/services/platform/inventory-location-restriction-service";

export default async function InventoryLocationLimitPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const [{ versionId }, query] = await Promise.all([params, searchParams]);
  const result = await listInventoryLocationLimits(versionId);
  if (!result) notFound();

  async function saveLimitsAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const submittedVersionId = String(formData.get("versionId") || "");
    const limits = [...formData.entries()]
      .filter(([key]) => key.startsWith("max:"))
      .map(([key, value]) => ({
        segmentAssignmentId: key.slice("max:".length),
        maxLocations: String(value),
      }));
    try {
      await saveInventoryLocationLimits(submittedVersionId, limits);
    } catch (error) {
      redirect(`/platform/versions/${versionId}/custom-restrictions/location-limit?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save Location limits.")}`);
    }
    redirect(`/platform/versions/${versionId}/custom-restrictions/location-limit?success=Location%20limits%20saved.`);
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <Link href={`/platform/versions/${versionId}/custom-restrictions`} className="text-sm font-semibold text-amber-800 hover:underline">
            Back to Custom Restrictions
          </Link>
          <p className="erp-eyebrow mt-5">Inventory Management / Hard-coded restriction</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Location Limit</h1>
          <p className="mt-1 text-sm text-slate-600">Set the maximum number of Locations an organization can create for each Inventory segment. Blank means unlimited.</p>
        </div>
        {query.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{query.error}</p>}
        {query.success && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{query.success}</p>}
        <Card className="space-y-4 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">{result.version.version_name}</h2>
              <p className="text-xs text-slate-500">Inventory Management</p>
            </div>
            <Badge>{result.segments.length} segment{result.segments.length === 1 ? "" : "s"}</Badge>
          </div>
          {result.segments.length > 0 ? (
            <form action={saveLimitsAction} className="space-y-3 px-4 pb-4">
              <input type="hidden" name="versionId" value={versionId} />
              <Table>
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Segment</th>
                    <th className="px-3 py-2.5">Maximum Locations</th>
                    <th className="px-3 py-2.5">Current Limit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.segments.map((segment) => (
                    <tr key={segment.assignmentId}>
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-800">{segment.segmentName}</td>
                      <td className="max-w-xs px-3 py-2.5">
                        <Input
                          name={`max:${segment.assignmentId}`}
                          type="number"
                          min="0"
                          max="2147483647"
                          step="1"
                          defaultValue={segment.maxLocations ?? ""}
                          placeholder="Unlimited"
                          aria-label={`Maximum Locations for ${result.version.version_name} ${segment.segmentName}`}
                          className="max-w-xs rounded-md px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-600">{segment.maxLocations?.toLocaleString("en-IN") ?? "Unlimited"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="flex justify-end"><Button type="submit" size="sm">Save limits</Button></div>
            </form>
          ) : (
            <p className="px-4 pb-4 text-sm text-slate-500">No active Inventory Management segments are configured for this version.</p>
          )}
        </Card>
      </Section>
    </Page>
  );
}