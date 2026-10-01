import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { assignOrganizationPlatformVersion, getOrganizationClient, listPlatformVersions } from "@/lib/services/platform/client-service";
import { listOrganizationSegmentPricing, resetOrganizationSegmentPrice, setOrganizationSegmentCustomPrice } from "@/lib/services/platform/organization-segment-pricing-service";
import { deleteOrganizationFromPlatform, updateOrganizationApprovalStatus } from "@/lib/services/organizations/organization-service";
import OrganizationDetailTabs from "./organization-detail-tabs";
import OrganizationSubscriptionPricing from "./organization-subscription-pricing";

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
  searchParams?: Promise<{ error?: string; success?: string; tab?: string; businessType?: string }>;
}) {
  const { organizationId } = await params;
  const query = (await searchParams) ?? {};
  const [organization, platformVersions] = await Promise.all([
    getOrganizationClient(organizationId),
    listPlatformVersions(),
  ]);

  if (!organization) {
    notFound();
  }
  const pricing = await listOrganizationSegmentPricing(organizationId);

  async function saveCustomSegmentPrice(formData: FormData) {
    "use server";
    const businessTypeId = String(formData.get("businessTypeId") || "");
    try {
      await setOrganizationSegmentCustomPrice(
        organizationId,
        String(formData.get("assignmentId") || ""),
        String(formData.get("price") || ""),
      );
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=subscriptions&businessType=${encodeURIComponent(businessTypeId)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save custom price.")}`);
    }
    redirect(`/platform/organisations/${organizationId}?tab=subscriptions&businessType=${encodeURIComponent(businessTypeId)}&success=${encodeURIComponent("Custom price saved.")}`);
  }

  async function resetCustomSegmentPrice(formData: FormData) {
    "use server";
    const businessTypeId = String(formData.get("businessTypeId") || "");
    try {
      await resetOrganizationSegmentPrice(
        organizationId,
        String(formData.get("assignmentId") || ""),
      );
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=subscriptions&businessType=${encodeURIComponent(businessTypeId)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to reset custom price.")}`);
    }
    redirect(`/platform/organisations/${organizationId}?tab=subscriptions&businessType=${encodeURIComponent(businessTypeId)}&success=${encodeURIComponent("Organization price reset to its version snapshot.")}`);
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

  async function assignPlatformVersion(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await assignOrganizationPlatformVersion(organizationId, String(formData.get("platformVersionId") || ""));
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to assign version.")}`);
    }
    redirect(`/platform/organisations/${organizationId}`);
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
        {query.success && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{query.success}</p>}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.85fr)] xl:items-center">
          <header>
            <Link href="/platform/organisations" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              Back to Organisations
            </Link>
            <p className="erp-eyebrow mt-4">Organisation record</p>
            <h1 className="mt-1 break-words text-2xl font-bold text-slate-900">{organization.organization_name}</h1>
            <p className="mt-2 text-sm text-slate-500">Created {new Date(organization.created_at).toLocaleString()}</p>
          </header>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">Approval &amp; version</h2>
              <Badge>{organization.approval_status.replaceAll("_", " ")}</Badge>
            </div>
            <form action={assignPlatformVersion} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="platform-version">Required platform version</label>
              <Select id="platform-version" name="platformVersionId" defaultValue={organization.platform_version_id ?? ""} required className="min-w-0 flex-1 rounded-md border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                <option value="">Select a required version...</option>
                {platformVersions.map((version) => <option key={version.id} value={version.id}>{version.version_name}{version.description ? ` - ${version.description}` : ""}</option>)}
              </Select>
              <Button type="submit" size="sm" className="rounded-md bg-emerald-700 px-4 text-white hover:bg-emerald-800">Save version</Button>
            </form>
            <p className="mt-2 text-xs text-slate-500">A version must be assigned before this organisation can be approved.</p>
            <form action={updateApprovalStatus} className="mt-3 flex flex-wrap gap-2" aria-label="Organisation approval status">
              {[
                { value: "PENDING_APPROVAL", label: "Pending", className: "border-amber-200 text-amber-700 hover:bg-amber-50" },
                { value: "APPROVED", label: "Approved", className: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
                { value: "REJECTED", label: "Rejected", className: "border-red-200 text-red-700 hover:bg-red-50" },
              ].map((status) => (
                <Button
                  key={status.value}
                  type="submit"
                  name="approvalStatus"
                  value={status.value}
                  aria-pressed={organization.approval_status === status.value}
                  disabled={status.value === "APPROVED" && !organization.platformVersion?.is_active}
                  variant="secondary"
                  size="sm"
                  className={`${status.className} ${
                    organization.approval_status === status.value ? "bg-slate-100 ring-1 ring-slate-300" : "bg-white"
                  }`}
                >
                  {status.label}
                </Button>
              ))}
            </form>
          </section>
        </div>

        <OrganizationDetailTabs initialValue={query.tab === "subscriptions" ? "subscriptions" : undefined} panels={[
          {
            label: "Overview",
            value: "overview",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Organisation profile</h2></div>
                <dl className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Detail label="Organisation name" value={organization.organization_name} />
                  <Detail label="Public organisation ID" value={organization.organization_id} />
                  <Detail label="GST number" value={organization.gst_number} />
                  <Detail label="Approval status" value={organization.approval_status.replaceAll("_", " ")} />
                  <Detail label="Operational status" value={organization.is_active ? "Active" : "Inactive"} />
                  <Detail label="Registered address" value={address} />
                  <Detail label="Created" value={new Date(organization.created_at).toLocaleString()} />
                  <Detail label="Last updated" value={new Date(organization.updated_at).toLocaleString()} />
                </dl>
              </section>
            ),
          },
          {
            label: "Database",
            value: "database",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Database connection</h2></div>
                {organization.databaseConnection ? (
                  <dl className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    <Detail label="Connection" value={organization.databaseConnection.connection_name} />
                    <Detail label="Provider" value={organization.databaseConnection.provider} />
                    <Detail label="Connection status" value={organization.databaseConnection.status} />
                    <Detail label="Host" value={organization.databaseConnection.host ?? "Not provided"} />
                    <Detail label="Port" value={organization.databaseConnection.port == null ? "Not provided" : String(organization.databaseConnection.port)} />
                    <Detail label="Database name" value={organization.databaseConnection.database_name ?? "Not provided"} />
                    <Detail label="Default connection" value={organization.databaseConnection.is_default ? "Yes" : "No"} />
                  </dl>
                ) : <p className="p-4 text-sm text-slate-500">No database connection is assigned.</p>}
              </section>
            ),
          },
          {
            label: "Pricing",
            value: "pricing",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Plan and version</h2></div>
                <dl className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Detail label="Plan" value={organization.plan?.plan_name ?? "Unassigned"} />
                  <Detail label="Plan status" value={organization.plan ? (organization.plan.is_active ? "Active" : "Inactive") : "Not assigned"} />
                  <Detail label="Price" value={organization.plan?.price == null ? "Not set" : `₹${Number(organization.plan.price).toLocaleString("en-IN")}`} />
                  <Detail label="Billing cycle" value={organization.plan?.billing_cycle ?? "Not set"} />
                  <Detail label="Plan description" value={organization.plan?.description ?? "Not provided"} />
                  <Detail label="Platform version" value={organization.platformVersion?.version_name ?? "Not assigned"} />
                </dl>
              </section>
            ),
          },
          {
            label: "Subscriptions",
            value: "subscriptions",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-bold text-slate-900">Version segment pricing</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {pricing.versionName
                      ? `${pricing.versionName} prices are captured when assigned. Custom prices change billing only; version restrictions and limits remain unchanged.`
                      : "Assign a platform version to configure this organization's segment prices."}
                  </p>
                </div>
                {pricing.businessTypes.length > 0 ? (
                  <OrganizationSubscriptionPricing
                    businessTypes={pricing.businessTypes}
                    initialBusinessTypeId={query.businessType}
                    onSaveCustomSegmentPrice={saveCustomSegmentPrice}
                    onResetCustomSegmentPrice={resetCustomSegmentPrice}
                  />
                ) : <p className="p-4 text-sm text-slate-500">No business types or segments are configured for the assigned version.</p>}
              </section>
            ),
          },
          {
            label: `Users (${organization.memberships.length})`,
            value: "users",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Organisation users</h2></div>
                {organization.memberships.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[42rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">User</th><th className="px-4 py-3 font-semibold">Role</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Joined</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {organization.memberships.map((membership) => (
                          <tr key={membership.id}>
                            <td className="px-4 py-3"><p className="font-medium text-slate-800">{membership.workspaceUser.full_name}</p><p className="text-xs text-slate-500">{membership.workspaceUser.email}</p></td>
                            <td className="px-4 py-3 text-slate-700">{membership.role}</td>
                            <td className="px-4 py-3 text-slate-700">{membership.is_active ? "Active" : "Inactive"}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(membership.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="p-4 text-sm text-slate-500">No users are assigned to this organisation.</p>}
              </section>
            ),
          },
          {
            label: "Activity",
            value: "activity",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Organisation records</h2></div>
                <dl className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Detail label="Orders" value={String(organization._count.merchandisingOrders)} />
                  <Detail label="Master records" value={String(organization._count.masterEntities)} />
                  <Detail label="Subscriptions" value={String(organization._count.subscriptions)} />
                  <Detail label="Support tickets" value={String(organization._count.supportTickets)} />
                  <Detail label="Created" value={new Date(organization.created_at).toLocaleString()} />
                  <Detail label="Last updated" value={new Date(organization.updated_at).toLocaleString()} />
                </dl>
              </section>
            ),
          },
        ]} />

        <section className="flex flex-col justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold text-red-900">Delete organisation</h2>
            <p className="mt-1 text-xs text-red-700">This permanently deletes the organisation and all related business records.</p>
          </div>
          <form action={deleteOrganization}>
            <Button type="submit" variant="danger" size="sm" className="rounded-md">
              Delete Organisation
            </Button>
          </form>
        </section>
      </Section>
    </Page>
  );
}