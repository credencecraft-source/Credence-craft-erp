import { listBusinessTypes, createBusinessType, deleteBusinessType, updateBusinessTypeStatus } from "@/lib/services/platform/business-type-service";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { redirect } from "next/navigation";

export default async function BusinessTypesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const businessTypes = await listBusinessTypes();
  const params = (await searchParams) ?? {};

  async function createAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "");
    const description = String(formData.get("description") || "");

    try {
      await createBusinessType({ name, description });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create business type.";
      redirect(`/platform/business-types?error=${encodeURIComponent(message)}`);
    }

    redirect("/platform/business-types");
  }

  async function toggleStatusAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const currentStatus = formData.get("isActive") === "true";

    try {
      if (id) {
        await updateBusinessTypeStatus(id, !currentStatus);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update status.";
      redirect(`/platform/business-types?error=${encodeURIComponent(message)}`);
    }

    redirect("/platform/business-types");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    try {
      if (id) {
        await deleteBusinessType(id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete business type.";
      redirect(`/platform/business-types?error=${encodeURIComponent(message)}`);
    }

    redirect("/platform/business-types");
  }

  return (
    <Page className="max-w-4xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Business Types</h1>
          <p className="text-sm text-slate-600">Manage business categories for subscription plans.</p>
        </div>

        {params.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <Card className="p-6">
          <form action={createAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input label="Business Type Name" name="name" required placeholder="e.g. Retail Store" />
            </div>
            <div className="flex-1">
              <Input label="Description" name="description" placeholder="Optional details..." />
            </div>
            <Button type="submit">Add Business Type</Button>
          </form>
        </Card>

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {businessTypes.map((bt) => {
              const isActive = bt.isActive ?? true;
              return (
                <tr key={bt.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-slate-800">{bt.name}</td>
                  <td className="px-4 py-3 text-slate-600">{bt.description || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <form action={toggleStatusAction} className="inline">
                      <input type="hidden" name="id" value={bt.id} />
                      <input type="hidden" name="isActive" value={String(isActive)} />
                      <button
                        type="submit"
                        className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors cursor-pointer ${
                          isActive 
                            ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200" 
                            : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                        }`}
                      >
                        {isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>

                    <form action={deleteAction} className="inline">
                      <input type="hidden" name="id" value={bt.id} />
                      <button
                        type="submit"
                        className="px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Section>
    </Page>
  );
}