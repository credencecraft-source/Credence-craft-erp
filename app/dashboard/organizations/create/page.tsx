import { after } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { countOrganizationsForUser } from "@/lib/services/organizations/organization-service";
import { createOrganizationDummyDataForNewOrganization } from "@/lib/services/organizations/organization-dummy-data-service";
import { GstVerificationError } from "@/lib/services/organizations/gst-verification-service";
import { createOrganizationFromGst } from "@/lib/services/organizations/organization-onboarding-service";
import CreateOrganizationForm from "./create-organization-form";

export const maxDuration = 180;

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

    const mobileNo = String(formData.get("mobileNo") || "").trim();
    const organizationEmail = String(formData.get("organizationEmail") || "").trim();
    const gstNumberVal = String(formData.get("gstNumber") || "").trim().toUpperCase();
    const actionUser = await requireSessionUser();

    try {
      const result = await createOrganizationFromGst({
        workspaceUserId: actionUser.id,
        gstNumber: gstNumberVal,
        organizationEmail,
        mobileNo,
      });
      after(async () => {
        try {
          await createOrganizationDummyDataForNewOrganization(
            actionUser.id,
            result.organizationId,
            actionUser.full_name || actionUser.email,
          );
        } catch {
          console.error("Background organization sample-data setup failed.");
        }
      });
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof GstVerificationError
        ? error.message
        : error instanceof Error && /^(Organization name is required|Organization email must|Organization schema is out of date|Organization database table is not available yet|GST number is required|GST number must|Mobile number must)/.test(error.message)
          ? error.message
          : "Unable to create the organization. Please try again or contact support.";
      return { ok: false as const, error: message };
    }
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