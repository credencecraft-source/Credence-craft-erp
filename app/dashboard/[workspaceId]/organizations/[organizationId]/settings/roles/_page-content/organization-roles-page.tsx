"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";

type Role = {
  role: string;
  label: string;
  permissions: string[];
  userCount: number;
  isSystem?: boolean;
};

export default function OrganizationRolesPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const router = useRouter();
  const [route, setRoute] = useState<{ workspaceId: string; organizationId: string }>();
  const [roles, setRoles] = useState<Role[]>([]);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role>();

  useEffect(() => { void params.then(setRoute); }, [params]);

  useEffect(() => {
    if (!route) return;
    let active = true;
    void fetch(`/api/organizations/${route.organizationId}/role-permissions`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load roles.");
        if (active) setRoles(payload.roles || []);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "Unable to load roles.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [route]);

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? roles.filter((role) => `${role.label} ${role.role}`.toLocaleLowerCase().includes(query)) : roles;
  }, [roles, search]);

  if (!route) return <main className="p-4 md:p-8">Loading roles...</main>;

  async function createRole() {
    if (!newRoleLabel.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/organizations/${route!.organizationId}/role-permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newRoleLabel, permissions: [] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create role.");
      router.push(`/dashboard/${route!.workspaceId}/organizations/${route!.organizationId}/settings/roles/${payload.role.role}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create role.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!deleteTarget || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/organizations/${route!.organizationId}/role-permissions/${deleteTarget.role}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to delete role.");
      setRoles((current) => current.filter((item) => item.role !== deleteTarget.role));
      setMessage(`${deleteTarget.label} deleted.`);
      setDeleteTarget(undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[var(--erp-text)]">Roles &amp; Permissions</h1>
        <p className="text-sm text-[var(--erp-muted)]">Choose a role folder to review its organization permissions.</p>
      </header>

      {message && <p role="status" className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-text)]">{message}</p>}

      <Card>
        <h2 className="font-semibold text-[var(--erp-text)]">Create role</h2>
        <p className="mt-1 text-sm text-[var(--erp-muted)]">New roles start with no permissions. Configure access after creating the role.</p>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={(event) => { event.preventDefault(); void createRole(); }}>
          <Input value={newRoleLabel} onChange={(event) => setNewRoleLabel(event.target.value)} placeholder="Role name" aria-label="Role name" className="sm:max-w-sm" />
          <Button type="submit" disabled={!newRoleLabel.trim() || saving}>Create role</Button>
        </form>
      </Card>

      <section aria-labelledby="roles-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="roles-heading" className="text-lg font-semibold text-[var(--erp-text)]">Organization roles</h2>
            <p className="text-sm text-[var(--erp-muted)]">{roles.length} roles available</p>
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roles" aria-label="Search roles" className="sm:max-w-xs" />
        </div>

        {loading ? (
          <p role="status" className="py-6 text-sm text-[var(--erp-muted)]">Loading roles...</p>
        ) : filteredRoles.length === 0 ? (
          <Card><p className="text-sm text-[var(--erp-muted)]">{search ? "No roles match your search." : "No roles are available."}</p></Card>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRoles.map((role) => (
              <Card key={role.role} className="h-full transition-colors hover:border-[var(--erp-brand)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings/roles/${role.role}`}
                      className="rounded-sm font-semibold text-[var(--erp-text)] hover:text-[var(--erp-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
                    >
                      {role.label}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--erp-muted)]">{role.isSystem ? "Built-in role" : "Custom role"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full border border-[var(--erp-border)] px-2.5 py-1 text-xs text-[var(--erp-muted)]">
                      {role.role === "OWNER" ? "Full access" : `${role.permissions.length} permissions`}
                    </span>
                    {!role.isSystem && (
                      <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteTarget(role)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--erp-muted)]">{role.userCount} assigned {role.userCount === 1 ? "user" : "users"}</span>
                  <Link
                    href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings/roles/${role.role}`}
                    className="font-semibold text-[var(--erp-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
                  >
                    Open folder
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} ariaLabel="Confirm role deletion" size="square" variant="danger">
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--erp-text)]">Delete role?</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Delete {deleteTarget?.label}? This is allowed only when no active members or pending invitations use the role.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(undefined)} disabled={saving}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => void deleteRole()} disabled={saving}>
              {saving ? "Deleting..." : "Delete role"}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
