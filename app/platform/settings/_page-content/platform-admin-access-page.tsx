import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import PlatformAccessDeleteForm from "@/app/platform/settings/_page-content/platform-access-delete-form";
import {
  createPlatformAccessAccount,
  deletePlatformAccessAccount,
  listPlatformAccessAccounts,
  setPlatformAccessAccountActive,
  updatePlatformAccessAccount,
} from "@/lib/services/platform/platform-admin-access-service";

export default async function PlatformAdminAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const actor = await requirePlatformSessionAdmin();
  if (actor.team_role) {
    redirect("/platform/organisations");
  }
  const accounts = await listPlatformAccessAccounts();
  const query = (await searchParams) ?? {};
  const mayCreatePlatformAdmin = actor.role === "SUPER_ADMIN";

  async function createAccount(formData: FormData) {
    "use server";
    const kind = String(formData.get("kind") ?? "");
    if (kind !== "ADMIN" && kind !== "CMO" && kind !== "CTO") {
      redirect("/platform/settings/access?error=Select%20a%20valid%20access%20type.");
    }
    try {
      await createPlatformAccessAccount({
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        mobileNumber: String(formData.get("mobileNumber") ?? ""),
        kind,
      });
    } catch (error) {
      redirect(`/platform/settings/access?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create the platform account.")}`);
    }
    redirect("/platform/settings/access?success=Platform access was added.");
  }

  async function updateAccountStatus(formData: FormData) {
    "use server";
    const accountId = String(formData.get("accountId") ?? "");
    const isActive = formData.get("isActive") === "true";
    try {
      await setPlatformAccessAccountActive(accountId, isActive);
    } catch (error) {
      redirect(`/platform/settings/access?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update platform access.")}`);
    }
    redirect("/platform/settings/access?success=Platform access status was updated.");
  }

  async function editAccount(formData: FormData) {
    "use server";
    const accountId = String(formData.get("accountId") ?? "");
    const kind = String(formData.get("kind") ?? "");
    if (kind !== "ADMIN" && kind !== "CMO" && kind !== "CTO") {
      redirect("/platform/settings/access?error=Select%20a%20valid%20access%20type.");
    }
    try {
      await updatePlatformAccessAccount(accountId, {
        kind,
        managerId: String(formData.get("managerId") ?? ""),
      });
    } catch (error) {
      redirect(`/platform/settings/access?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to edit platform access.")}`);
    }
    redirect("/platform/settings/access?success=Platform%20access%20was%20updated.");
  }

  async function deleteAccount(formData: FormData) {
    "use server";
    try {
      await deletePlatformAccessAccount(String(formData.get("accountId") ?? ""));
    } catch (error) {
      redirect(`/platform/settings/access?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete platform access.")}`);
    }
    redirect("/platform/settings/access?success=Platform%20access%20was%20deleted.");
  }

  return (
    <Page className="max-w-none">
      <Section className="space-y-3">
        <header>
          <p className="erp-eyebrow">Platform Settings</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Platform access</h1>
          <p className="mt-1 text-sm text-slate-600">
            Change account roles, status, or remove platform access.
          </p>
        </header>

        {query.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{query.error}</p>}
        {query.success && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{query.success}</p>}

        <Card className="p-3">
          <h2 className="text-sm font-bold text-slate-900">
            {mayCreatePlatformAdmin ? "Add an Admin" : "Assign a team seat"}
          </h2>
          <form action={createAccount} className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Full name" name="fullName" required minLength={2} maxLength={255} autoComplete="name" />
            <Input label="Email address" name="email" type="email" required maxLength={255} autoComplete="email" />
            <Input label="Mobile number" name="mobileNumber" type="tel" required pattern="^\+?[1-9]\d{7,14}$" placeholder="+919876543210" autoComplete="tel" />
            <div className="flex items-end gap-2">
              <Select
                label="Access"
                name="kind"
                required
                defaultValue={mayCreatePlatformAdmin ? "ADMIN" : "CMO"}
                options={mayCreatePlatformAdmin
                  ? [{ label: "Admin", value: "ADMIN" }]
                  : [{ label: "CMO — Sales", value: "CMO" }, { label: "CTO — Support", value: "CTO" }]}
              />
              <Button type="submit" size="sm" className="shrink-0">Add access</Button>
            </div>
          </form>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-bold text-slate-900">Platform team accounts</h2>
            <p className="mt-0.5 text-xs text-slate-500">Inactive accounts remain available for reactivation.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Account</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-900">{account.full_name}</p>
                      <p className="text-xs text-slate-500">{account.email} · {account.mobile_number ?? "No mobile"} · Last sign-in: {account.last_login_at?.toLocaleString() ?? "Never"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <form action={editAccount} className="flex min-w-max items-center gap-1.5">
                        <input type="hidden" name="accountId" value={account.id} />
                        {account.manager_id && <input type="hidden" name="managerId" value={account.manager_id} />}
                        <Select
                          aria-label={`${account.full_name} access type`}
                          name="kind"
                          defaultValue={account.team_role ?? "ADMIN"}
                          className="min-w-28 px-2 py-1.5"
                          options={[
                            ...(mayCreatePlatformAdmin ? [{ label: "Admin", value: "ADMIN" }] : []),
                            ...(["CMO", "CTO"] as const)
                              .filter((role) => {
                                const roleAssignedToAnotherAccount = accounts.some(
                                  (candidate) =>
                                  candidate.id !== account.id &&
                                  candidate.manager_id === (account.manager_id ?? actor.id) &&
                                    candidate.team_role === role,
                                );
                                return !roleAssignedToAnotherAccount || account.team_role === role;
                              })
                              .map((role) => ({ label: role, value: role })),
                          ]}
                        />
                        <Button type="submit" size="sm">Save</Button>
                      </form>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {account.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={updateAccountStatus}>
                          <input type="hidden" name="accountId" value={account.id} />
                          <input type="hidden" name="isActive" value={String(!account.is_active)} />
                          <Button type="submit" size="sm" variant="secondary">
                            {account.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </form>
                        {mayCreatePlatformAdmin && (
                          <PlatformAccessDeleteForm
                            accountId={account.id}
                            accountName={account.full_name}
                            deleteAction={deleteAccount}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">No platform team accounts have been added yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
