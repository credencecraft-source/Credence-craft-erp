import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { listWorkspaceUsers } from "@/lib/services/platform/workspace-user-service";
import PlatformWorkspaceUsersReport from "./platform-workspace-users-report";

export default async function PlatformWorkspaceUsersPage() {
  const users = await listWorkspaceUsers();

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