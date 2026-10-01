import { requireSessionUser } from "@/lib/auth/session-manager";
import { countOrganizationsForUser, createOrganization } from "@/lib/services/organizations/organization-service";
import { redirect } from "next/navigation";
import CreateOrganizationForm from "./create-organization-form";

export const maxDuration = 60;

export default async function CreateOrganizationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const user = await requireSessionUser();
  const params = (await searchParams) ?? {};
  const isOnboardingRequired = await countOrganizationsForUser(user.id) === 0;

  async function createOrganizationAction(formData: FormData) {
    "use server";

    const organizationNameVal = String(formData.get("organizationName") || "").trim();
    const mobileNo = String(formData.get("mobileNo") || "").trim();
    const organizationEmail = String(formData.get("organizationEmail") || "").trim();
    const gstNumberVal = String(formData.get("gstNumber") || "").trim().toUpperCase();
    const addressLine1Val = String(formData.get("addressLine1") || "").trim();
    const addressLine2Val = String(formData.get("addressLine2") || "").trim();
    const cityVal = String(formData.get("city") || "").trim();
    const stateVal = String(formData.get("state") || "").trim();
    const countryVal = String(formData.get("country") || "").trim();
    const pinCodeVal = String(formData.get("pinCode") || "").trim();

    let createdOrganizationId = "";

    try {
      const newOrg = await createOrganization({
        workspaceUserId: user.id,
        organizationName: organizationNameVal,
        mobileNo,
        organizationEmail,
        gstNumber: gstNumberVal,
        addressLine1: addressLine1Val,
        addressLine2: addressLine2Val,
        city: cityVal,
        state: stateVal,
        country: countryVal,
        pinCode: pinCodeVal,
      });
      createdOrganizationId = newOrg.organization_id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create organization.";
      redirect(`/dashboard/organizations/create?error=1&message=${encodeURIComponent(message)}`);
    }
    return { organizationId: createdOrganizationId };
  }

  return (
    <CreateOrganizationForm 
      workspaceId={user.workspace_id} 
      userName={user.full_name || user.profile_name}
      userEmail={user.email}
      isOnboardingRequired={isOnboardingRequired}
      error={params.error} 
      message={params.message}
      action={createOrganizationAction}
    />
  );
}