import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { createSegment, deleteSegment, listSegments } from "@/lib/services/platform/segment-service";

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const [segments, params] = await Promise.all([
    listSegments(),
    searchParams ?? Promise.resolve({ error: undefined } as { error?: string }),
  ]);

  async function createAction(formData: FormData) {
    "use server";
    try {
      await createSegment({
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
      });
    } catch (error) {
      redirect(`/platform/segments?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create segment.")}`);
    }
    redirect("/platform/segments");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    try {
      await deleteSegment(String(formData.get("id") || ""));
    } catch (error) {
      redirect(`/platform/segments?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete segment.")}`);
    }
    redirect("/platform/segments");
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform Catalog</p>
          <h1 className="text-2xl font-bold text-slate-900">Segments</h1>
          <p className="text-sm text-slate-600">Maintain the reusable customer tiers available inside every version and business type.</p>
        </div>

        {params.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</p>}

        <Card className="p-6">
          <form action={createAction} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Input label="Segment name" name="name" required placeholder="Enterprise" />
            <Input label="Description" name="description" placeholder="Optional positioning or limits" />
            <Button type="submit">Create segment</Button>
          </form>
        </Card>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Table>
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-3">Segment</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {segments.map((segment) => (
                <tr key={segment.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{segment.name}</td>
                  <td className="px-4 py-3 text-slate-600">{segment.description || "-"}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{segment.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-3 text-right"><form action={deleteAction}><input type="hidden" name="id" value={segment.id} /><button type="submit" className="text-xs font-semibold text-rose-600 hover:underline">Delete</button></form></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Section>
    </Page>
  );
}
