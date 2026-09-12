import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getOrganizationClient } from "@/lib/services/platform/client-service";
import { deleteOrganizationFromPlatform, updateOrganizationApprovalStatus } from "@/lib/services/organizations/organization-service";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value || "Not provided"}</dd>
    </div>
  );
}

export default async function PlatformOrganizationDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { organizationId } = await params;
  const query = (await searchParams) ?? {};
  const organization = await getOrganizationClient(organizationId);

  if (!organization) {
    notFound();
  }

  async function updateApprovalStatus(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    await updateOrganizationApprovalStatus(organizationId, String(formData.get("approvalStatus")));
    redirect(`/platform/organisations/${organizationId}`);
  }

  async function deleteOrganization() {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await deleteOrganizationFromPlatform(organizationId);
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete organisation.")}`);
    }
    redirect("/platform/organisations");
  }

  const address = [
    organization.address_line_1,
    organization.address_line_2,
    organization.city,
    organization.state,
    organization.country,
    organization.pin_code,
  ].filter(Boolean).join(", ");

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        {query.error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{query.error}</p>}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <Link href="/platform/organisations" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              Back to Organisations
            </Link>
            <p className="erp-eyebrow mt-5">Organisation details</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{organization.organization_name}</h1>
            <p className="mt-1 text-sm text-slate-500">Registered {new Date(organization.created_at).toLocaleDateString()}</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Badge>{organization.approval_status.replaceAll("_", " ")}</Badge>
            <form action={updateApprovalStatus} className="flex flex-wrap gap-2">
              {[
                { value: "PENDING_APPROVAL", label: "Pending", className: "border-amber-200 text-amber-700 hover:bg-amber-50" },
                { value: "APPROVED", label: "Approved", className: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
                { value: "REJECTED", label: "Rejected", className: "border-red-200 text-red-700 hover:bg-red-50" },
              ].map((status) => (
                <button
                  key={status.value}
                  type="submit"
                  name="approvalStatus"
                  value={status.value}
                  aria-pressed={organization.approval_status === status.value}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${status.className} ${
                    organization.approval_status === status.value ? "bg-slate-100 ring-1 ring-slate-300" : "bg-white"
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </form>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Business identity</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Organisation name" value={organization.organization_name} />
              <Detail label="GST number" value={organization.gst_number} />
              <Detail label="Status" value={organization.is_active ? "Active" : "Inactive"} />
              <Detail label="Organisation ID" value={organization.organization_id} />
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Registered address</h2>
            <dl className="mt-4">
              <Detail label="Address" value={address} />
            </dl>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Account setup</h2>
            <dl className="mt-4 space-y-4">
              <Detail label="Plan" value={organization.plan?.plan_name ?? "Unassigned"} />
              <Detail label="Database" value={organization.databaseConnection?.connection_name ?? "Unassigned"} />
              <Detail label="Database status" value={organization.databaseConnection?.status ?? "Not connected"} />
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-bold text-slate-900">Organisation members</h2>
            <div className="mt-4 divide-y divide-slate-100">
              {organization.memberships.map((membership) => (
                <div key={membership.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{membership.workspaceUser.full_name}</p>
                    <p className="text-xs text-slate-500">{membership.workspaceUser.email}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{membership.role}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Organisation activity</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="Orders" value={String(organization._count.merchandisingOrders)} />
            <Detail label="Master records" value={String(organization._count.masterEntities)} />
            <Detail label="Subscriptions" value={String(organization._count.subscriptions)} />
            <Detail label="Support tickets" value={String(organization._count.supportTickets)} />
          </div>
        </section>

        <section className="flex flex-col justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold text-red-900">Delete organisation</h2>
            <p className="mt-1 text-xs text-red-700">This permanently deletes the organisation and all related business records.</p>
          </div>
          <form action={deleteOrganization}>
            <button type="submit" className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700">
              Delete Organisation
            </button>
          </form>
        </section>
      </Section>
    </Page>
  );
}