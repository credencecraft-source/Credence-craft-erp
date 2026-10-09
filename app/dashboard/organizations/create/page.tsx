import { after } from "next/server";
import { cookies } from "next/headers";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { hasOrganizationsForUser } from "@/lib/services/organizations/organization-service";
import { createOrganizationDummyDataForNewOrganization } from "@/lib/services/organizations/organization-dummy-data-service";
import { GstVerificationError } from "@/lib/services/organizations/gst-verification-service";
import { createOrganizationFromGst } from "@/lib/services/organizations/organization-onboarding-service";
import {
  isOrganizationEmailVerificationTokenValid,
  ORGANIZATION_EMAIL_VERIFICATION_COOKIE,
} from "@/lib/services/organizations/organization-email-verification-service";
import CreateOrganizationForm from "./create-organization-form";

export const maxDuration = 180;

export default async function CreateOrganizationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const user = await requireSessionUser();
  const params = (await searchParams) ?? {};
  const isOnboardingRequired = !await hasOrganizationsForUser(user.id);

  async function createOrganizationAction(formData: FormData) {
    "use server";

    const mobileNo = String(formData.get("mobileNo") || "").trim();
    const organizationEmail = String(formData.get("organizationEmail") || "").trim();
    const gstNumberVal = String(formData.get("gstNumber") || "").trim().toUpperCase();
    const actionUser = await requireSessionUser();

    try {
      const cookieStore = await cookies();
      const emailVerificationToken = cookieStore.get(ORGANIZATION_EMAIL_VERIFICATION_COOKIE)?.value;
      if (!isOrganizationEmailVerificationTokenValid(
        emailVerificationToken,
        actionUser.id,
        organizationEmail,
      )) {
        return { ok: false as const, error: "Verify the organization email before continuing." };
      }

      const ownerName = String(formData.get("ownerName") || "").trim();
      const result = await createOrganizationFromGst({
        workspaceUserId: actionUser.id,
        ownerName,
        gstNumber: gstNumberVal,
        organizationEmail,
        mobileNo,
      });
      after(async () => {
        try {
          await createOrganizationDummyDataForNewOrganization(
            actionUser.id,
            result.organizationId,
            actionUser.full_name,
          );
        } catch {
          console.error("Background organization sample-data setup failed.");
        }
      });
      cookieStore.delete(ORGANIZATION_EMAIL_VERIFICATION_COOKIE);
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof GstVerificationError
        ? error.message
        : error instanceof Error && /^(Organization name is required|Email is required|Organization email must|This email address is already linked|Organization schema is out of date|Organization database table is not available yet|GST number is required|GST number must|Mobile number must)/.test(error.message)
          ? error.message
          : "Unable to create the organization. Please try again or contact support.";
      return { ok: false as const, error: message };
    }
  }

  return (
    <CreateOrganizationForm 
      workspaceId={user.workspace_id} 
      userEmail={user.email ?? ""}
      userMobileNumber={user.mobile_number ?? ""}
      isOnboardingRequired={isOnboardingRequired}
      error={params.error}
      message={params.message}
      action={createOrganizationAction}
    />
  );
}