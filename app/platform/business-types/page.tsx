import { ReactNode } from "react";
import { redirect } from "next/navigation";

import {
  listBusinessTypes,
  createBusinessType,
  deleteBusinessType,
  updateBusinessTypeStatus,
} from "@/lib/services/platform/business-type-service";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

export default async function BusinessTypesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const businessTypes = await listBusinessTypes();
  const params = (await searchParams) ?? {};

  // Lookup options derived from existing modules registry
  const lookupOptions = ERP_MODULES.map((m) => ({
    label: m.label,
    value: m.key,
  }));

  async function createAction(formData: FormData) {
    "use server";
    const lookupKey = String(formData.get("lookupKey") || "");
    let name = String(formData.get("name") || "");
    const description = String(formData.get("description") || "");

    // Fallback to chosen lookup label if name field is left blank
    if (!name && lookupKey) {
      const selected = lookupOptions.find((opt) => opt.value === lookupKey);
      if (selected) name = selected.label;
    }

    try {
      await createBusinessType({
        name,
        description,
        ...(lookupKey ? { pathSegment: lookupKey } : {}),
      } as any);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create business type.";
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
      const message =
        error instanceof Error ? error.message : "Unable to update status.";
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
      const message =
        error instanceof Error ? error.message : "Unable to delete business type.";
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
          <p className="text-sm text-slate-600">
            Manage business categories and map modules for subscription plans.
          </p>
        </div>

        {params.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <Card className="p-6">
          <form action={createAction} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Lookup Selection Dropdown */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Select From Lookup
                </label>
                <select
                  name="lookupKey"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Module Template --</option>
                  {lookupOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Input
                  label="Business Type Name"
                  name="name"
                  placeholder="e.g. Order Management"
                />
              </div>

              <div>
                <Input
                  label="Description"
                  name="description"
                  placeholder="Optional details..."
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit">Add Business Type</Button>
            </div>
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
                  <td className="px-4 py-3 text-slate-600">
                    {bt.description || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        isActive
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border border-slate-200 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="space-x-2 px-4 py-3 text-right">
                    <form action={toggleStatusAction} className="inline">
                      <input type="hidden" name="id" value={bt.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={String(isActive)}
                      />
                      <button
                        type="submit"
                        className={`cursor-pointer rounded border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isActive
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>

                    <form action={deleteAction} className="inline">
                      <input type="hidden" name="id" value={bt.id} />
                      <button
                        type="submit"
                        className="cursor-pointer rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100"
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