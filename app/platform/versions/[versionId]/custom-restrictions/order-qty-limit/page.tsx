import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listOrderQuantityLimits, saveOrderQuantityLimits } from "@/lib/services/platform/order-quantity-limit-service";

export default async function OrderQuantityLimitRestrictionPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const [{ versionId }, query] = await Promise.all([params, searchParams]);
  const versions = await listOrderQuantityLimits(versionId);
  if (versions.length === 0) notFound();

  async function saveLimitsAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const targetVersionId = String(formData.get("versionId") || "");
    const limits = [...formData.entries()]
      .filter(([key]) => key.startsWith("limit:"))
      .map(([key, value]) => ({
        segmentAssignmentId: key.slice("limit:".length),
        monthlyQtyLimit: String(value),
      }));
    try {
      await saveOrderQuantityLimits(targetVersionId, limits);
    } catch (error) {
      redirect(`/platform/versions/${versionId}/custom-restrictions/order-qty-limit?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save order quantity limits.")}`);
    }
    redirect(`/platform/versions/${versionId}/custom-restrictions/order-qty-limit?success=Order%20quantity%20limits%20saved.`);
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div>
          <Link href={`/platform/versions/${versionId}/custom-restrictions`} className="text-sm font-semibold text-amber-800 hover:underline">
            Back to Custom Restrictions
          </Link>
          <p className="erp-eyebrow mt-5">Order Management / Hard-coded restriction</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Order Qty Limit</h1>
          <p className="mt-1 text-sm text-slate-600">Set the maximum total order quantity allowed per month for each segment. Blank means unlimited.</p>
        </div>
        {query.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{query.error}</p>}
        {query.success && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{query.success}</p>}
        {versions.map((version) => (
          <Card key={version.id} className="space-y-4 p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{version.version_name}</h2>
                <p className="text-xs text-slate-500">Order Management</p>
              </div>
              <Badge>{version.segments.length} segment{version.segments.length === 1 ? "" : "s"}</Badge>
            </div>
            {version.segments.length > 0 ? (
              <form action={saveLimitsAction} className="space-y-3 px-4 pb-4">
                <input type="hidden" name="versionId" value={version.id} />
                <Table>
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Segment</th>
                      <th className="px-3 py-2.5">Monthly Order Qty Limit</th>
                      <th className="px-3 py-2.5">Current Limit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {version.segments.map((segment) => (
                      <tr key={segment.assignmentId}>
                        <td className="px-3 py-2.5 text-sm font-medium text-slate-800">{segment.segmentName}</td>
                        <td className="max-w-xs px-3 py-2.5">
                          <Input
                            name={`limit:${segment.assignmentId}`}
                            type="number"
                            min="1"
                            max="2147483647"
                            step="1"
                            defaultValue={segment.monthlyQtyLimit ?? ""}
                            placeholder="Unlimited"
                            aria-label={`Monthly order quantity limit for ${version.version_name} ${segment.segmentName}`}
                            className="max-w-xs rounded-md px-2 py-1.5 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-600">{segment.monthlyQtyLimit?.toLocaleString("en-IN") ?? "Unlimited"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <div className="flex justify-end">
                  <Button type="submit" size="sm">Save limits</Button>
                </div>
              </form>
            ) : (
              <p className="px-4 pb-4 text-sm text-slate-500">No active Order Management segments are configured for this version.</p>
            )}
          </Card>
        ))}
      </Section>
    </Page>
  );
}