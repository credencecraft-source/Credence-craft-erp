import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { createPlatformTag, listPlatformTags, renamePlatformTag, setPlatformTagActive } from "@/lib/services/platform/platform-tag-service";

export default async function PlatformTagsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const [tags, params] = await Promise.all([
    listPlatformTags(),
    searchParams ?? Promise.resolve({ error: undefined, success: undefined } as { error?: string; success?: string }),
  ]);

  async function createAction(formData: FormData) {
    "use server";
    try {
      await createPlatformTag(String(formData.get("label") || ""));
    } catch (error) {
      redirect(`/platform/tags?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create tag.")}`);
    }
    redirect("/platform/tags?success=Tag%20created.");
  }

  async function statusAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const isActive = String(formData.get("isActive") || "") === "true";
    try {
      await setPlatformTagActive(id, !isActive);
    } catch (error) {
      redirect(`/platform/tags?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update tag status.")}`);
    }
    redirect("/platform/tags?success=Tag%20status%20updated.");
  }

  async function renameAction(formData: FormData) {
    "use server";
    try {
      await renamePlatformTag(
        String(formData.get("id") || ""),
        String(formData.get("label") || ""),
      );
    } catch (error) {
      redirect(`/platform/tags?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to rename tag.")}`);
    }
    redirect("/platform/tags?success=Tag%20renamed.");
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform Catalog</p>
          <h1 className="text-2xl font-bold text-slate-900">Tags</h1>
          <p className="text-sm text-slate-600">
            Manage reusable audience tags and assign them to business types within each version.
          </p>
        </div>

        {params.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</p>}
        {params.success && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{params.success}</p>}

        <Card className="p-6">
          <form action={createAction} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <Input label="Tag name" name="label" required maxLength={100} placeholder="Retail" />
            <Button type="submit">Create tag</Button>
          </form>
        </Card>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Table>
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Assigned business types</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td className="px-4 py-3">
                    <form action={renameAction} className="flex items-end gap-2">
                      <input type="hidden" name="id" value={tag.id} />
                      <Input name="label" aria-label={`Tag name for ${tag.label}`} required maxLength={100} defaultValue={tag.label} className="max-w-xs" />
                      <Button type="submit" variant="secondary" size="sm">Save</Button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{tag._count.versionBusinessTypes}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tag.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {tag.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={statusAction}>
                      <input type="hidden" name="id" value={tag.id} />
                      <input type="hidden" name="isActive" value={String(tag.is_active)} />
                      <Button type="submit" variant="secondary" size="sm">
                        {tag.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
              {tags.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-500">No tags are in the catalog yet.</td></tr>
              )}
            </tbody>
          </Table>
        </div>
      </Section>
    </Page>
  );
}
