import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import {
  getAuthOtpCopySetting,
  PlatformEmailConfigurationError,
  setAuthOtpCopySetting,
} from "@/lib/services/platform/platform-email-configuration-service";
import { listWorkspaceUsers } from "@/lib/services/platform/workspace-user-service";
import PlatformWorkspaceUsersReport from "./platform-workspace-users-report";

export default async function PlatformWorkspaceUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const [users, sendAuthOtpToCredencecraft] = await Promise.all([
    listWorkspaceUsers(),
    getAuthOtpCopySetting(),
  ]);
  const params = (await searchParams) ?? {};

  async function saveAuthOtpCopySetting(formData: FormData) {
    "use server";
    try {
      await setAuthOtpCopySetting(
        formData.get("sendAuthOtpToCredencecraft") === "on",
      );
    } catch (error) {
      redirect(
        `/platform/workspace-users?error=${encodeURIComponent(
          error instanceof PlatformEmailConfigurationError
            ? error.message
            : "Unable to save the OTP email setting.",
        )}`,
      );
    }
    revalidatePath("/platform/workspace-users");
    redirect("/platform/workspace-users?success=OTP email setting saved.");
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Workspace Users</h1>
          <p className="text-sm text-slate-600">
            {users.length.toLocaleString("en-IN")} workspace account{users.length === 1 ? "" : "s"} · email is optional; mobile and email verification are shown separately.
          </p>
        </div>

        {params.error && (
          <p role="alert" className="text-sm font-medium text-[var(--erp-danger)]">
            {params.error}
          </p>
        )}
        {params.success && (
          <p role="status" className="text-sm text-[var(--erp-success)]">
            {params.success}
          </p>
        )}

        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">
              Authentication OTP delivery
            </h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              When enabled, customer sign-in and registration OTPs are also
              sent privately to credencecraft@gmail.com. Support OTPs are not
              copied.
            </p>
          </div>
          <form action={saveAuthOtpCopySetting} className="flex flex-wrap items-center justify-between gap-4">
            <Checkbox
              name="sendAuthOtpToCredencecraft"
              label="Send authentication OTP to credencecraft@gmail.com"
              defaultChecked={sendAuthOtpToCredencecraft}
            />
            <Button type="submit">Save OTP setting</Button>
          </form>
        </Card>

        <PlatformWorkspaceUsersReport
          users={users.map((user) => ({
            id: user.id,
            full_name: user.full_name,
            profile_name: user.profile_name,
            email: user.email,
            emailVerified: user.email
              ? user.email_verified ? "Verified" : "Pending"
              : "Not provided",
            mobileNumber: user.mobile_number ?? "",
            mobileVerification: user.mobile_number
              ? user.mobile_verified_at ? "Verified" : "Pending"
              : "Not provided",
            lastLogin: user.last_login_at
              ? new Date(user.last_login_at).toLocaleString()
              : "Never",
            organisations: user.organisations
              .map((organization) => organization.organization_name)
              .join(", "),
            organisationCount: user.organisations.length,
            totalRecords: user.totalRecords,
            status: user.status,
          }))}
        />
      </Section>
    </Page>
  );
}