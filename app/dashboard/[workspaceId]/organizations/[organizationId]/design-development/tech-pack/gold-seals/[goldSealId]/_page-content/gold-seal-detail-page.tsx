import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  createMasterValueForOrganization,
  deleteMasterValue,
  getMasterValuesForOrganization,
} from "@/lib/master-data/master-data-constants";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";

async function createGoldSealVariant(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const goldSealValueId = String(formData.get("goldSealValueId") ?? "");
  const variant = String(formData.get("variant") ?? "").trim();
  const variantCode = String(formData.get("variant_code") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();

  if (!workspaceId || !organizationId || !goldSealValueId || !variant || !variantCode) {
    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(goldSealValueId)}?error=${encodeURIComponent("Variant name and variant code are required.")}`);
  }

  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

  const goldSeals = await getMasterValuesForOrganization(organization.id, "gold-seal", true);
  const goldSeal = goldSeals.find((item) => item.value_id === goldSealValueId || item.id === goldSealValueId);
  if (!goldSeal) notFound();

  await createMasterValueForOrganization(organization.id, "gold-seal-variant", {
    label: variant,
    fields: { variant, variant_code: variantCode, color: color || null, size: size || null, sku: sku || null, barcode: barcode || null },
    parentValueId: goldSeal.value_id,
  });

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(goldSeal.value_id)}`);
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(goldSeal.value_id)}`);
}

async function deleteGoldSealVariant(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const goldSealValueId = String(formData.get("goldSealValueId") ?? "");
  const variantValueId = String(formData.get("variantValueId") ?? "");
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
  await deleteMasterValue(organization.id, variantValueId);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(goldSealValueId)}`);
}

export default async function GoldSealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; goldSealId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { workspaceId, organizationId, goldSealId } = await params;
  const { error } = await searchParams;
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();

  const goldSeals = await getMasterValuesForOrganization(organization.id, "gold-seal", true);
  const goldSeal = goldSeals.find((item) => item.value_id === decodeURIComponent(goldSealId) || item.id === decodeURIComponent(goldSealId));
  if (!goldSeal) notFound();

  const variants = (await getMasterValuesForOrganization(organization.id, "gold-seal-variant", true))
    .filter((item) => item.parent_id === goldSeal.id || item.parent_id === goldSeal.value_id);
  const fields = goldSeal.fields ?? {};
  const detailPath = `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(goldSeal.value_id)}`;

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals`} className="text-sm font-medium text-emerald-700">Back to Gold Seal</Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">{goldSeal.label}</h1>
          <p className="mt-1 text-sm text-slate-500">Gold Seal header and fixed stock variants</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">{goldSeal.code ?? "Gold Seal"}</span>
      </div>

      {error ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Detail label="Gold Seal Name" value={goldSeal.label} />
        <Detail label="Gold Seal Code" value={goldSeal.code ?? "-"} />
        <Detail label="Design By" value={String(fields.design_by ?? "-")} />
        <Detail label="Designed Date" value={String(fields.designed_date ?? "-")} />
        <Detail label="Status" value={goldSeal.is_active ? "Active" : "Pending"} />
        <Detail label="Variants" value={String(variants.length)} />
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Gold Seal Variants</h2>
            <p className="mt-1 text-sm text-slate-500">Create fixed color, size, SKU, and barcode combinations for this Gold Seal.</p>
          </div>
          <a href="#create-variant" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Create Variant</a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="p-3">Variant</th><th className="p-3">Code</th><th className="p-3">Color</th><th className="p-3">Size</th><th className="p-3">SKU</th><th className="p-3">Barcode</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {variants.map((item) => {
                const variantFields = item.fields ?? {};
                return <tr key={item.id} className="border-b border-slate-100"><td className="p-3 font-semibold text-slate-900">{item.label}</td><td className="p-3">{String(variantFields.variant_code ?? "-")}</td><td className="p-3">{String(variantFields.color ?? "-")}</td><td className="p-3">{String(variantFields.size ?? "-")}</td><td className="p-3">{String(variantFields.sku ?? "-")}</td><td className="p-3">{String(variantFields.barcode ?? "-")}</td><td className="p-3"><form action={deleteGoldSealVariant}><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="goldSealValueId" value={goldSeal.value_id} /><input type="hidden" name="variantValueId" value={item.value_id} /><button type="submit" className="text-xs font-semibold text-red-700">Delete</button></form></td></tr>;
              })}
              {variants.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">No variants created yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section id="create-variant" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Create Variant</h2>
        <form action={createGoldSealVariant} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="goldSealValueId" value={goldSeal.value_id} />
          <Field name="variant" label="Variant Name" required /><Field name="variant_code" label="Variant Code" required /><Field name="color" label="Color" /><Field name="size" label="Size" /><Field name="sku" label="SKU" /><Field name="barcode" label="Barcode" />
          <div className="sm:col-span-2 lg:col-span-3"><button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Save Variant</button></div>
        </form>
      </section>
    </main>
  );
}

function Field({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <label className="space-y-1 text-sm font-semibold text-slate-700"><span>{label}{required ? " *" : ""}</span><input name={name} required={required} className="w-full rounded-lg border border-slate-300 bg-white p-2 font-normal" /></label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p></div>;
}
