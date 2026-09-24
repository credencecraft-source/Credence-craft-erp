import Link from "next/link";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { getVersionDetails } from "@/lib/services/platform/version-service";

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

        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`/platform/versions/${version.id}/module-based`}>
            <Card className="h-full border-emerald-200 p-5 transition-colors hover:bg-emerald-50/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Restriction type 01</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Module-based restrictions</h2>
              <p className="mt-2 text-sm text-slate-600">Choose a business type and segment to manage module, submodule, and action access.</p>
              <span className="mt-5 inline-block text-sm font-semibold text-emerald-700">Manage by business type →</span>
            </Card>
          </Link>
          <Link href={`/platform/versions/${version.id}/transaction-based`}>
            <Card className="h-full border-violet-200 p-5 transition-colors hover:bg-violet-50/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Restriction type 02</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Transaction-based restrictions</h2>
              <p className="mt-2 text-sm text-slate-600">Set application-wide monthly record limits by transaction form and segment.</p>
              <span className="mt-5 inline-block text-sm font-semibold text-violet-700">Manage transaction limits →</span>
            </Card>
          </Link>
        </div>

      </Section>
    </Page>
  );
}
