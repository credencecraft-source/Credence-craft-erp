import Link from "next/link";
import { redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import VersionEditDialog from "@/app/platform/versions/_components/version-edit-dialog";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getPlatformVersionTypeLabel } from "@/lib/constants/platform-version-types";
import { getVersionDetails, updateVersionDetails } from "@/lib/services/platform/version-service";

export default async function VersionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const { versionId } = await params;
  const [version, messages] = await Promise.all([
    getVersionDetails(versionId),
    searchParams ?? Promise.resolve({ error: undefined, success: undefined }),
  ]);
  if (!version) redirect("/platform/versions?error=Version%20not%20found");

  async function updateVersionAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await updateVersionDetails(
        versionId,
        String(formData.get("versionName") || ""),
        String(formData.get("description") || ""),
        String(formData.get("versionType") || ""),
      );
    } catch (error) {
      redirect(`/platform/versions/${versionId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update version.")}`);
    }
    redirect(`/platform/versions/${versionId}?success=Version%20updated.`);
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Version Configuration</p>
            <h1 className="text-2xl font-bold text-slate-900">{version.version_name}</h1>
            <Badge className="mt-2">{getPlatformVersionTypeLabel(version.version_type)}</Badge>
            <p className="text-sm text-slate-600">{version.description || "No description provided."}</p>
          </div>
          <div className="flex items-center gap-3">
            <VersionEditDialog
              versionName={version.version_name}
              versionType={version.version_type}
              description={version.description ?? ""}
              action={updateVersionAction}
            />
            <Link href="/platform/versions" className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to versions</Link>
          </div>
        </div>

        {messages.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
        {messages.success && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{messages.success}</p>}

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
          <Link href={`/platform/versions/${version.id}/custom-restrictions`}>
            <Card className="h-full border-amber-200 p-5 transition-colors hover:bg-amber-50/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Restriction type 03</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Custom Restrictions</h2>
              <span className="mt-5 inline-block text-sm font-semibold text-amber-800">Open custom restrictions →</span>
            </Card>
          </Link>
        </div>

      </Section>
    </Page>
  );
}
