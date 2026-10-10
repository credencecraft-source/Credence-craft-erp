import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { assignOrganizationPlatformVersion, getOrganizationClient, listPlatformVersions } from "@/lib/services/platform/client-service";
import { listOrganizationSegmentPricing, resetOrganizationSegmentPrice, setOrganizationSegmentCustomPrice } from "@/lib/services/platform/organization-segment-pricing-service";
import { deleteOrganizationFromPlatform, forceDeleteOrganizationFromPlatform, getOrganizationDeletionEligibility, ORGANIZATION_DELETE_RETENTION_DAYS, updateOrganizationApprovalStatusWithTransition } from "@/lib/services/organizations/organization-service";
import { startOrganizationDummyDataAfterApproval } from "@/lib/services/organizations/organization-dummy-data-service";
import { extendOrganizationTrial, listOrganizationTrialHistory, removeOrganizationTrial } from "@/lib/services/platform/organization-trial-service";
import {
  getOrganizationKycProfileForPlatform,
  OrganizationKycReviewError,
  reviewOrganizationKyc,
} from "@/lib/services/organizations/organization-kyc-service";
import { readOrganizationKycDetails } from "@/lib/services/organizations/organization-kyc-types";
import OrganizationDetailTabs from "./organization-detail-tabs";
import OrganizationKycStepTabs from "./organization-kyc-step-tabs";
import OrganizationPlatformVersionAssignment from "./organization-platform-version-assignment";
import OrganizationSubscriptionPricing from "./organization-subscription-pricing";
import OrganizationTrialControls from "../../_page-content/organization-trial-controls";
import OrganizationDeleteControl from "./organization-delete-control";
import { countActiveOrganizationMembers, getPlatformPricingSettings, setOrganizationPricingMode, type PricingMode } from "@/lib/services/platform/pricing-mode-service";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm text-slate-800">{value || "Not provided"}</dd>
    </div>
  );
}

function readKycRegistrationSnapshot(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const snapshot = value as Record<string, unknown>;
  return {
    name: typeof snapshot.name === "string" ? snapshot.name : null,
    gstNumber: typeof snapshot.gst_number === "string" ? snapshot.gst_number : null,
    address: typeof snapshot.address === "string" ? snapshot.address : null,
    createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : null,
  };
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
  const platformAdmin = await requirePlatformSessionAdmin();
  const [organization, platformVersions] = await Promise.all([
    getOrganizationClient(organizationId),
    listPlatformVersions(),
  ]);

  if (!organization) {
    notFound();
  }
  const internalOrganizationId = organization.id;
  const [pricing, trialHistory, pricingSettings, activeUserCount, kycProfile] = await Promise.all([
    listOrganizationSegmentPricing(organizationId),
    listOrganizationTrialHistory(organizationId),
    getPlatformPricingSettings(),
    countActiveOrganizationMembers(organization.id),
    getOrganizationKycProfileForPlatform(organization.id),
  ]);
  const trialExtensionRequests = trialHistory.requests;
  const kycDetails = readOrganizationKycDetails(kycProfile?.kyc_details);
  const registrationSnapshot = readKycRegistrationSnapshot(kycProfile?.registration_snapshot);
  const kycValue = (value: string | null | undefined) => value?.replaceAll("_", " ") || "Not provided";
  const kycList = (values: string[]) => values.length ? values.join(", ") : "Not provided";
  const kycStepPanels = kycProfile ? [
    {
      label: "Company",
      details: [
        { label: "Company name", value: registrationSnapshot.name ?? organization.organization_name },
        { label: "GSTIN", value: registrationSnapshot.gstNumber ?? organization.gst_number },
        {
          label: "Registered address",
          value: registrationSnapshot.address ?? ([
            organization.address_line_1,
            organization.address_line_2,
            organization.city,
            organization.state,
            organization.pin_code,
            organization.country,
          ].filter(Boolean).join(", ") || "Not provided"),
        },
        { label: "Organization profile created", value: registrationSnapshot.createdAt ?? organization.created_at.toLocaleDateString() },
        { label: "Business started", value: kycProfile.business_started_year == null ? "Not provided" : String(kycProfile.business_started_year) },
      ],
    },
    {
      label: "Founder & team",
      details: [
        { label: "Founder", value: [kycDetails.founderName, kycDetails.founderDesignation].filter(Boolean).join(" — ") || "Not provided" },
        { label: "Total team members", value: kycDetails.teamMemberCount == null ? "Not provided" : String(kycDetails.teamMemberCount) },
        { label: "Staff / labour", value: kycProfile.staff_count == null ? "Not provided" : String(kycProfile.staff_count) },
        { label: "Top management members", value: kycDetails.topManagementCount == null ? "Not provided" : String(kycDetails.topManagementCount) },
      ],
    },
    {
      label: "Business",
      details: [
        {
          label: "Products",
          value: kycList([
            ...kycDetails.products.filter((product) => product !== "Other"),
            ...(kycDetails.otherProduct ? [`Other: ${kycDetails.otherProduct}`] : []),
          ]),
        },
        {
            label: "Business types",
            value: kycList([...kycProfile.business_types, ...(kycProfile.business_type_other ? [kycProfile.business_type_other] : [])]),
        },
        { label: "Factories", value: kycProfile.factory_count == null ? "Not provided" : String(kycProfile.factory_count) },
        { label: "Outlets", value: kycProfile.outlet_count == null ? "Not provided" : String(kycProfile.outlet_count) },
        { label: "Monthly production (pcs)", value: kycProfile.monthly_production_pcs == null ? "Not provided" : String(kycProfile.monthly_production_pcs) },
        { label: "Activities", value: kycList(kycProfile.business_activities) },
        { label: "Factory arrangement", value: kycValue(kycProfile.factory_arrangement) },
        { label: "Washing unit", value: kycValue(kycDetails.washingUnit) },
        { label: "Embroidery unit", value: kycValue(kycDetails.embroideryUnit) },
        { label: "Shifts per day", value: kycDetails.shiftCount == null ? "Not provided" : String(kycDetails.shiftCount) },
      ],
    },
    {
      label: "Business role",
      details: [
        { label: "Business ownership", value: kycValue(kycDetails.businessRole) },
        { label: "Business channel", value: kycValue(kycDetails.businessChannel) },
        { label: "Brand model", value: kycValue(kycDetails.brandModel) },
      ],
    },
    {
      label: "Brands",
      details: [
        { label: "Own brands", value: kycDetails.ownBrandNames ?? "Not provided" },
        { label: "Own-brand sales channels", value: kycList(kycDetails.ownBrandChannels) },
        { label: "White-label brands", value: kycDetails.whiteLabelBrands ?? "Not provided" },
        { label: "Brands worked with", value: kycProfile.brands_worked_with ?? "Not provided" },
        { label: "White-label fulfilment", value: kycValue(kycDetails.whiteLabelFulfilment) },
      ],
    },
    {
      label: "Markets & work",
      details: [
        { label: "Market coverage", value: kycValue(kycDetails.marketCoverage) },
        { label: "Work types", value: kycList(kycDetails.whiteLabelWorkTypes) },
        { label: "Buyer-nominated raw materials", value: kycValue(kycDetails.buyerNominatedRawMaterials) },
      ],
    },
    {
      label: "Migration",
      details: [
        { label: "Currently using software", value: kycValue(kycDetails.usesSoftware) },
        { label: "Software used", value: kycProfile.software_used ?? "Not provided" },
        { label: "Software modules", value: kycList(kycDetails.softwareModules) },
        {
          label: "Finance software to integrate",
          value: kycList([
            ...kycDetails.financeSoftware
              .filter((value) => value !== "OTHER")
              .map((value) => value === "ZOHO_BOOKS" ? "Zoho Books" : value.replaceAll("_", " ")),
            ...(kycDetails.financeSoftwareOther ? [kycDetails.financeSoftwareOther] : []),
          ]),
        },
        { label: "Merchandisers handle orders", value: kycValue(kycDetails.hasMerchandisers) },
        { label: "Dedicated store in-charge", value: kycValue(kycDetails.hasDedicatedStoreIncharge) },
        { label: "Production manager / supervisor", value: kycValue(kycDetails.hasProductionManager) },
        { label: "Separate dispatch team", value: kycValue(kycDetails.hasSeparateDispatchAccounts) },
      ],
    },
    {
      label: "Financials",
      details: [
        { label: "Last financial year turnover", value: kycDetails.lastYearTurnover == null ? "Not provided" : `₹${kycDetails.lastYearTurnover.toLocaleString("en-IN")}` },
        { label: "MSME status", value: kycValue(kycDetails.msmeStatus) },
        { label: "Major challenges", value: kycList([...kycProfile.major_challenges, ...(kycProfile.major_challenge_other ? [kycProfile.major_challenge_other] : [])]) },
        { label: "Submitted", value: kycProfile.submitted_at?.toLocaleString() ?? "Not submitted" },
        { label: "Review note", value: kycProfile.review_note ?? "Not provided" },
      ],
    },
  ] : [];

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
    try {
      const result = await updateOrganizationApprovalStatusWithTransition(
        organizationId,
        String(formData.get("approvalStatus")),
      );
      if (result.approvedNow) {
        after(async () => {
          try {
            await startOrganizationDummyDataAfterApproval(result.organization.id);
          } catch (error) {
            console.error(
              "Automatic sample-data setup failed after organization approval.",
              error instanceof Error ? error.message : "Unknown setup error.",
            );
          }
        });
      }
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=pricing&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update approval status.")}`);
    }
    redirect(`/platform/organisations/${organizationId}?tab=pricing&success=${encodeURIComponent("Approval status updated.")}`);
  }

  async function reviewKyc(formData: FormData) {
    "use server";
    const admin = await requirePlatformSessionAdmin();
    const approvedValue = formData.get("approved");
    if (approvedValue !== "true" && approvedValue !== "false") {
      redirect(`/platform/organisations/${organizationId}?tab=kyc&error=${encodeURIComponent("Select an approve or reject action.")}`);
    }
    const noteValue = formData.get("note");
    const note = typeof noteValue === "string" ? noteValue.trim() : "";
    try {
      await reviewOrganizationKyc(admin.id, internalOrganizationId, approvedValue === "true", note || undefined);
    } catch (error) {
      if (error instanceof OrganizationKycReviewError) {
        redirect(`/platform/organisations/${organizationId}?tab=kyc&error=${encodeURIComponent(error.message)}`);
      }
      throw error;
    }
    revalidatePath(`/platform/organisations/${organizationId}`);
    redirect(`/platform/organisations/${organizationId}?tab=kyc&success=${encodeURIComponent(approvedValue === "true" ? "KYC profile approved." : "KYC profile rejected.")}`);
  }

  async function deleteOrganization() {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await deleteOrganizationFromPlatform(organizationId);
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=delete&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete organisation.")}`);
    }
    redirect("/platform/organisations");
  }

  async function forceDeleteOrganization(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      const confirmationName = formData.get("confirmationName");
      await forceDeleteOrganizationFromPlatform(
        organizationId,
        typeof confirmationName === "string" ? confirmationName : "",
      );
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=delete&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to force delete organisation.")}`);
    }
    redirect("/platform/organisations");
  }

  async function assignPlatformVersion(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await assignOrganizationPlatformVersion(
        organizationId,
        String(formData.get("platformVersionId") || ""),
        String(formData.get("versionType") || ""),
      );
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=pricing&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to assign version.")}`);
    }
    redirect(`/platform/organisations/${organizationId}?tab=pricing&success=${encodeURIComponent("Platform version assigned.")}`);
  }

  async function updatePricingModeAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await setOrganizationPricingMode(organizationId, String(formData.get("pricingMode") || "") as PricingMode);
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=pricing-type&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update pricing type.")}`);
    }
    redirect(`/platform/organisations/${organizationId}?tab=pricing-type&success=${encodeURIComponent("Pricing type updated.")}`);
  }

  async function extendTrial(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await extendOrganizationTrial(organizationId, Number(formData.get("extensionHours")));
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=trial&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to extend trial.")}`);
    }
    redirect(`/platform/organisations/${organizationId}?tab=trial&success=${encodeURIComponent("Trial extended.")}`);
  }

  async function removeTrial() {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await removeOrganizationTrial(organizationId);
    } catch (error) {
      redirect(`/platform/organisations/${organizationId}?tab=trial&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to remove trial.")}`);
    }
    redirect(`/platform/organisations/${organizationId}?tab=trial&success=${encodeURIComponent("Trial removed.")}`);
  }

  const address = [
    organization.address_line_1,
    organization.address_line_2,
    organization.city,
    organization.state,
    organization.country,
    organization.pin_code,
  ].filter(Boolean).join(", ");
  const deletionEligibility = getOrganizationDeletionEligibility(organization.archived_at);
  const isArchived = organization.approval_status === "ARCHIVED";

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        {query.error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">{query.error}</p>}
        {query.success && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700" role="status" aria-live="polite">{query.success}</p>}
        <div>
          <header>
            <Link href="/platform/organisations" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              Back to Organisations
            </Link>
            <p className="erp-eyebrow mt-4">Organisation record</p>
            <h1 className="mt-1 break-words text-2xl font-bold text-slate-900">{organization.organization_name}</h1>
            <p className="mt-2 text-sm text-slate-500">Created {new Date(organization.created_at).toLocaleString()}</p>
          </header>
        </div>

        <OrganizationDetailTabs initialValue={["overview", "database", "pricing-type", "pricing", "subscriptions", "trial", "users", "activity", "delete", "kyc"].includes(query.tab ?? "") ? query.tab : undefined} panels={[
          {
            label: "Pricing Type",
            value: "pricing-type",
            content: (
              <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Organization pricing type</h2>
                  <p className="mt-1 text-xs text-slate-600">Select the billing model. The assigned version continues to control module access, restrictions, and operational limits.</p>
                </div>
                <form action={updatePricingModeAction} className="flex flex-wrap items-end gap-3">
                  <Select
                    label="Pricing type"
                    name="pricingMode"
                    defaultValue={organization.pricing_mode}
                    className="min-w-56"
                    options={[
                      ...(pricingSettings.module_based_active ? [{ value: "MODULE_BASED", label: "Module Based Pricing" }] : []),
                      ...(pricingSettings.user_based_active ? [{ value: "USER_BASED", label: "User Based Pricing" }] : []),
                    ]}
                  />
                  <Button type="submit" size="sm">Save pricing type</Button>
                </form>
                <p className="text-xs text-slate-500">Current type: {organization.pricing_mode === "USER_BASED" ? "User Based Pricing" : "Module Based Pricing"}</p>
              </section>
            ),
          },
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
            label: "KYC",
            value: "kyc",
            content: (
              <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Organization KYC review</h2>
                    <p className="mt-1 text-xs text-slate-600">Review the organization’s submitted profile and record the platform decision.</p>
                  </div>
                  <Badge>{kycProfile?.status?.replaceAll("_", " ") ?? "NOT STARTED"}</Badge>
                </div>
                {kycProfile ? (
                  <>
                    <OrganizationKycStepTabs steps={kycStepPanels} />
                    {kycProfile.status === "SUBMITTED" ? (
                      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                        <form action={reviewKyc} className="flex flex-wrap items-end gap-3">
                          <input type="hidden" name="approved" value="true" />
                          <Input label="Approval note (optional)" name="note" maxLength={2000} />
                          <Button type="submit" size="sm">Approve KYC</Button>
                        </form>
                        <form action={reviewKyc} className="flex flex-wrap items-end gap-3">
                          <input type="hidden" name="approved" value="false" />
                          <Input label="Rejection reason" name="note" maxLength={2000} required />
                          <Button type="submit" variant="destructive" size="sm">Reject KYC</Button>
                        </form>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-600">The organization has not started its KYC profile.</p>
                )}
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
            label: "Version & Access",
            value: "pricing",
            content: (
              <div className="space-y-4">
                <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-bold text-slate-900">Approval &amp; version</h2>
                    <Badge>{organization.approval_status.replaceAll("_", " ")}</Badge>
                  </div>
                  <OrganizationPlatformVersionAssignment
                    versions={platformVersions}
                    assignedVersionId={organization.platform_version_id}
                    action={assignPlatformVersion}
                  />
                  <p className="mt-2 text-xs text-slate-500">A version is optional for approval. The pricing shortcut inside the organisation appears after a version is assigned.</p>
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
                        disabled={organization.approval_status === status.value || (status.value === "APPROVED" && Boolean(organization.platform_version_id) && !organization.platformVersion?.is_active)}
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
              </div>
            ),
          },
          {
            label: organization.pricing_mode === "USER_BASED" ? "User Based Price" : "Module Based Price",
            value: "subscriptions",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-bold text-slate-900">
                    {organization.pricing_mode === "USER_BASED" ? "User Based Pricing" : "Version segment pricing"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {pricing.versionName
                      ? `${pricing.versionName} prices are captured when assigned. Custom prices change billing only; version restrictions and limits remain unchanged.`
                      : "Assign a platform version to configure this organization's segment prices."}
                  </p>
                </div>
                {organization.pricing_mode === "USER_BASED" ? (
                  <dl className="grid gap-4 p-4 sm:grid-cols-3">
                    <Detail label="Active billable members" value={String(activeUserCount)} />
                    <Detail label="Price per member / month" value={`₹${pricingSettings.user_monthly_price.toNumber().toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} />
                    <Detail label="Monthly total before GST" value={`₹${pricingSettings.user_monthly_price.mul(activeUserCount).toNumber().toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} />
                  </dl>
                ) : pricing.businessTypes.length > 0 ? (
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
            label: "Trial",
            value: "trial",
            content: (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-bold text-slate-900">Organisation trial</h2>
                  <p className="mt-1 text-xs text-slate-500">Manage trial access and extensions for this organisation.</p>
                </div>
                <dl className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Detail
                    label="Status"
                    value={!organization.trial_enabled
                      ? "Removed"
                      : !organization.trial_started_at
                        ? "Starts on first open"
                        : organization.trial_ends_at && organization.trial_ends_at > new Date()
                          ? "Active"
                          : "Expired"}
                  />
                  <Detail label="Started" value={organization.trial_started_at ? new Date(organization.trial_started_at).toLocaleString() : "Not started"} />
                  <Detail label="Ends" value={organization.trial_ends_at ? new Date(organization.trial_ends_at).toLocaleString() : "Not set"} />
                  <Detail label="Pre-start extension" value={`${organization.trial_extension_hours} hours`} />
                </dl>
                <div className="border-t border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Trial extension requests</h3>
                  {trialExtensionRequests.length > 0 ? (
                    <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
                      {trialExtensionRequests.map((request) => {
                        const isPending = ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"].includes(request.status);
                        return (
                          <li key={request.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">
                                {request.submittedBy?.full_name || request.submittedBy?.email || "Workspace User"}
                                <span className="ml-2 text-xs font-normal text-slate-500">{new Date(request.created_at).toLocaleString()}</span>
                              </p>
                              <p className="mt-1 text-xs text-slate-600">{request.description}</p>
                            </div>
                            <Badge>{isPending ? "Awaiting admin review" : request.status.replaceAll("_", " ")}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No trial extension requests have been submitted.</p>
                  )}
                </div>
                <div className="border-t border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Trial history</h3>
                  <p className="mt-1 text-xs text-slate-500">Chronological record of organisation creation, trial starts, expirations, requests, extensions, and removals.</p>
                  <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full min-w-[48rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-semibold">Date &amp; time</th>
                          <th scope="col" className="px-3 py-2 font-semibold">Event</th>
                          <th scope="col" className="px-3 py-2 font-semibold">Details</th>
                          <th scope="col" className="px-3 py-2 font-semibold">Actor / status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trialHistory.events.map((event) => (
                          <tr key={event.id}>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{new Date(event.occurredAt).toLocaleString()}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{event.title}</td>
                            <td className="min-w-[16rem] px-3 py-2 text-xs text-slate-600">{event.description}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {event.actor ?? "System"}
                              {event.status && <span className="mt-1 block font-semibold text-slate-700">{event.status}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="border-t border-slate-200 p-4">
                  <p className="mb-3 text-xs text-slate-600">
                    {trialExtensionRequests.some((request) => ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"].includes(request.status))
                      ? "Review the pending request above, set the approved hours, then extend the trial below. The request will be marked resolved."
                      : "The first three expired-trial requests are extended automatically for 24 hours. Later requests appear above for platform review."}
                  </p>
                  <OrganizationTrialControls
                    organizationId={organization.id}
                    organizationName={organization.organization_name}
                    trialEnabled={organization.trial_enabled}
                    extendAction={extendTrial}
                    removeAction={removeTrial}
                  />
                </div>
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
                            <td className="px-4 py-3"><p className="font-medium text-slate-800">{membership.workspaceUser.full_name}</p><p className="text-xs text-slate-500">{membership.workspaceUser.email ?? "Not provided"}</p></td>
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
          {
            label: "Delete",
            value: "delete",
            content: (
              <section className="flex flex-col justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-sm font-bold text-red-900">Delete organisation</h2>
                  <p id="organization-delete-retention" className="mt-1 text-xs text-red-700">
                    {!isArchived
                      ? `Archive this organisation first. Permanent deletion is available ${ORGANIZATION_DELETE_RETENTION_DAYS} days after archiving.`
                      : !organization.archived_at
                        ? "The archive date is unavailable. Restore and re-archive this organisation to start the 90-day retention period."
                        : deletionEligibility.isEligible
                          ? `Archived on ${organization.archived_at.toLocaleString()}. The 90-day retention period has elapsed; deletion is now available.`
                          : `Archived on ${organization.archived_at.toLocaleString()}. Deletion becomes available on ${deletionEligibility.eligibleAt?.toLocaleString()}.`}
                    {" "}Deletion permanently removes the organisation and related business records.
                  </p>
                  <p id="organization-force-delete-warning" className="mt-2 text-xs font-semibold text-red-800">
                    Force delete bypasses the archive and 90-day retention requirements. This cannot be undone.
                  </p>
                </div>
                {platformAdmin.role === "SUPER_ADMIN" ? (
                  <OrganizationDeleteControl
                    organizationName={organization.organization_name}
                    deleteAction={deleteOrganization}
                    forceDeleteAction={forceDeleteOrganization}
                    disabled={!isArchived || !deletionEligibility.isEligible}
                  />
                ) : (
                  <p className="max-w-xs text-xs font-semibold text-red-800">
                    Permanent organisation deletion is restricted to Super Admin.
                  </p>
                )}
              </section>
            ),
          },
        ]} />
      </Section>
    </Page>
  );
}