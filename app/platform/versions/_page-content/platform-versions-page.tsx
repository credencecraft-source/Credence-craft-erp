import Link from "next/link";
import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { createVersion, deleteVersion, listVersions } from "@/lib/services/platform/version-service";

export default async function PlatformVersionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const [versions, params] = await Promise.all([
    listVersions(),
    searchParams ?? Promise.resolve({ error: undefined } as { error?: string }),
  ]);

  async function createAction(formData: FormData) {
    "use server";
    try {
      await createVersion({
        versionName: String(formData.get("versionName") || ""),
        description: String(formData.get("description") || ""),
      });
    } catch (error) {
      redirect(`/platform/versions?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create version.")}`);
    }
    redirect("/platform/versions");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    try {
      await deleteVersion(String(formData.get("id") || ""));
    } catch (error) {
      redirect(`/platform/versions?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete version.")}`);
    }
    redirect("/platform/versions");
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform Catalog</p>
          <h1 className="text-2xl font-bold text-slate-900">Versions</h1>
          <p className="text-sm text-slate-600">Create release or commercial versions such as 2025, 2026, A, or B and configure their business-type segments.</p>
        </div>

        {params.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</p>}

        <Card className="p-6">
          <form action={createAction} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Input label="Version name" name="versionName" required placeholder="2026" />
            <Input label="Description" name="description" placeholder="Optional release notes" />
            <Button type="submit">Create version</Button>
          </form>
          <p className="mt-3 text-xs text-slate-500">Every new version starts with all active business types. Configure its segments from the version detail page.</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {versions.map((version) => (
            <div key={version.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Version</p><h2 className="mt-1 text-xl font-bold text-slate-900">{version.version_name}</h2><p className="mt-1 text-sm text-slate-500">{version.description || "No description"}</p></div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{version._count.businessTypes} business types</span>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <Link href={`/platform/versions/${version.id}`} className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">Open configuration</Link>
                <form action={deleteAction}><input type="hidden" name="id" value={version.id} /><button type="submit" className="text-xs font-semibold text-rose-600 hover:underline">Delete</button></form>
              </div>
            </div>
          ))}
          {versions.length === 0 && <Card className="p-8 text-center text-sm text-slate-500 md:col-span-2">No versions created yet.</Card>}
        </div>
      </Section>
    </Page>
  );
}
