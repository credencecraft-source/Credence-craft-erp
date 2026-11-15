import Link from "next/link";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import Badge from "@/components/ui/Badge";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

export default async function VersionCustomRestrictionsPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  await requirePlatformSessionAdmin();
  const { versionId } = await params;

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Version Restrictions</p>
            <h1 className="text-2xl font-bold text-slate-900">Custom Restrictions</h1>
          </div>
          <Link href={`/platform/versions/${versionId}`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Back to version
          </Link>
        </div>
        <Table>
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Business Type</th>
              <th className="px-4 py-3">Restriction</th>
              <th className="px-4 py-3">Implementation</th>
              <th className="px-4 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-4 py-3 text-sm text-slate-700">Order Management</td>
              <td className="px-4 py-3">
                <Link href={`/platform/versions/${versionId}/custom-restrictions/order-qty-limit`} className="font-semibold text-slate-900 hover:text-amber-800 hover:underline">
                  Order Qty Limit
                </Link>
              </td>
              <td className="px-4 py-3"><Badge>Hard-coded</Badge></td>
              <td className="px-4 py-3 text-right">
                <Link href={`/platform/versions/${versionId}/custom-restrictions/order-qty-limit`} className="text-xs font-semibold text-amber-800 hover:underline">
                  Open restriction
                </Link>
              </td>
            </tr>
            <tr className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-4 py-3 text-sm text-slate-700">Inventory Management</td>
              <td className="px-4 py-3">
                <Link href={`/platform/versions/${versionId}/custom-restrictions/location-limit`} className="font-semibold text-slate-900 hover:text-amber-800 hover:underline">
                  Location Limit
                </Link>
              </td>
              <td className="px-4 py-3"><Badge>Hard-coded</Badge></td>
              <td className="px-4 py-3 text-right">
                <Link href={`/platform/versions/${versionId}/custom-restrictions/location-limit`} className="text-xs font-semibold text-amber-800 hover:underline">
                  Open restriction
                </Link>
              </td>
            </tr>
          </tbody>
        </Table>
      </Section>
    </Page>
  );
}
