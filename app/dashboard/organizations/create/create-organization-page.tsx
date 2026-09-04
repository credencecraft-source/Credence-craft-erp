import Link from "next/link";
import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { createOrganization } from "@/lib/services/organizations/organization-service";

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
      redirect(`/dashboard/organizations/create?error=1&message=${encodeURIComponent(message)}`);
    }

    redirect(`/dashboard/${user.workspace_id}/home`);
  }

  return (
    <Page className="max-w-3xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="erp-eyebrow">Organization</p>
            <h1 className="erp-page-heading mt-1">Create Organization</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">Add a legal business entity to start managing its ERP operations.</p>
          </div>
          <Link
            href={`/dashboard/${user.workspace_id}/home`}
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Back to Workspace
          </Link>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {errorMessage}
          </div>
        )}

        <Card>
          <form action={createOrganizationAction} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="organizationName" label="Organization name" required placeholder="Credence Craft" />
              <Input name="gstNumber" label="GST number" required placeholder="27ABCDE1234F1Z5" />
              <Input name="addressLine1" label="Address line 1" placeholder="12 Market Road" />
              <Input name="addressLine2" label="Address line 2" placeholder="Floor 4, Suite 7" />
              <Input name="city" label="City" placeholder="Bengaluru" />
              <Input name="state" label="State" placeholder="Karnataka" />
              <Input name="country" label="Country" placeholder="India" />
              <Input name="pinCode" label="PIN code" placeholder="560001" />
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-4">
              <Button type="submit">Create Organization</Button>
            </div>
          </form>
        </Card>
      </Section>
    </Page>
  );
}
