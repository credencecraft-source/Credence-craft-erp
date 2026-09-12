import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { deleteInactiveWorkspaceUser, listWorkspaceUsers } from "@/lib/services/platform/workspace-user-service";

export default async function PlatformWorkspaceUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const users = await listWorkspaceUsers();

  async function deleteInactiveUser(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();

    try {
      await deleteInactiveWorkspaceUser(String(formData.get("userId")));
    } catch (error) {
      redirect(`/platform/workspace-users?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete workspace user.")}`);
    }

    redirect("/platform/workspace-users");
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Workspace Users</h1>
          <p className="text-sm text-slate-600">Review workspace accounts and their active organisation memberships.</p>
        </div>

        {query.error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{query.error}</p>}

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Profile</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Verification</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Organisations</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => {
              const organisationCount = user._count.organizationMemberships;
              const isInactive = organisationCount === 0;

              return (
                <tr key={user.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">@{user.profile_name}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email_verified ? "Verified" : "Pending"}</td>
                  <td className="px-4 py-3 text-slate-500">{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{organisationCount}</td>
                  <td className="px-4 py-3">
                    <Badge className={isInactive ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}>
                      {isInactive ? "Inactive" : "Active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {isInactive ? (
                      <form action={deleteInactiveUser}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button type="submit" className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">
                          Delete inactive
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">Protected</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={8}>No workspace users found.</td>
              </tr>
            )}
          </tbody>
        </Table>
      </Section>
    </Page>
  );
}