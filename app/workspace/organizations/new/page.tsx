import Link from "next/link";
import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { createOrganization } from "@/lib/organizations/service";

export default async function CreateOrganizationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string; success?: string }>;
}) {
  const user = await requireSessionUser();
  const params = (await searchParams) ?? {};
  const errorMessage =
    params.message ||
    (params.error ? "Unable to create organization. Please verify the details and try again." : "");

  async function createOrganizationAction(formData: FormData) {
    "use server";

    const organizationName = String(formData.get("organizationName") || "").trim();
    const gstNumber = String(formData.get("gstNumber") || "").trim().toUpperCase();
    const addressLine1 = String(formData.get("addressLine1") || "").trim();
    const addressLine2 = String(formData.get("addressLine2") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();
    const country = String(formData.get("country") || "").trim();
    const pinCode = String(formData.get("pinCode") || "").trim();

    try {
      await createOrganization({
        workspaceUserId: user.id,
        organizationName,
        gstNumber,
        addressLine1,
        addressLine2,
        city,
        state,
        country,
        pinCode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create organization.";
      redirect(`/workspace/organizations/new?error=1&message=${encodeURIComponent(message)}`);
    }

    redirect(`/workspace/${user.workspace_id}?success=organization-created`);
  }

  return (
    <main className="min-h-screen bg-[#f5f7f5] p-6 text-zinc-900">
      <div className="mx-auto max-w-4xl rounded-3xl border border-[#dfe6df] bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Organization</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create Organization</h1>
          </div>
          <Link
            href={`/workspace/${user.workspace_id}`}
            className="rounded-xl border border-[#dfe6df] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Back to Workspace
          </Link>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form action={createOrganizationAction} className="mt-8 space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium text-zinc-700 md:col-span-2">
              <span className="mb-2 block">Organization Name</span>
              <input
                name="organizationName"
                required
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="Credence Craft"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700 md:col-span-2">
              <span className="mb-2 block">GST Number</span>
              <input
                name="gstNumber"
                required
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="27ABCDE1234F1Z5"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700 md:col-span-2">
              <span className="mb-2 block">Address Line 1</span>
              <input
                name="addressLine1"
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="12 Market Road"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700 md:col-span-2">
              <span className="mb-2 block">Address Line 2</span>
              <input
                name="addressLine2"
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="Floor 4, Suite 7"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700">
              <span className="mb-2 block">City</span>
              <input
                name="city"
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="Bengaluru"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700">
              <span className="mb-2 block">State</span>
              <input
                name="state"
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="Karnataka"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700">
              <span className="mb-2 block">Country</span>
              <input
                name="country"
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="India"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700">
              <span className="mb-2 block">PIN Code</span>
              <input
                name="pinCode"
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                placeholder="560001"
              />
            </label>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-[#17372a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#214d3a]"
          >
            Create Organization
          </button>
        </form>
      </div>
    </main>
  );
}