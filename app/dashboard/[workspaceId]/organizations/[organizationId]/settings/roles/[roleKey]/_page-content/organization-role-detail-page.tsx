"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Switch from "@/components/ui/Switch";
import {
  getOrganizationOrderManagementPermission,
  getOrganizationModuleAccessPermission,
  getOrganizationModuleNavigationItems,
  type OrganizationOrderManagementAction,
  type OrganizationOrderManagementResource,
  type OrganizationPermissionKey,
  type OrganizationModuleNavigationItem,
} from "@/lib/organizations/organization-permission-registry";

type Role = { role: string; label: string; permissions: OrganizationPermissionKey[]; isSystem?: boolean };
const ORDER_MANAGEMENT_ACTIONS: readonly OrganizationOrderManagementAction[] = ["view", "create", "edit", "delete"];

function getNavigationAccessPermissions(item: OrganizationModuleNavigationItem): OrganizationPermissionKey[] {
  return [
    item.accessPermission,
    ...item.children.flatMap(getNavigationAccessPermissions),
  ];
}

function getNavigationAncestorPermissions(
  items: readonly OrganizationModuleNavigationItem[],
  keyPath: readonly string[],
): OrganizationPermissionKey[] {
  const permissions: OrganizationPermissionKey[] = [];
  let currentItems = items;
  for (const key of keyPath.slice(0, -1)) {
    const parent = currentItems.find((item) => item.key === key);
    if (!parent) break;
    permissions.push(parent.accessPermission);
    currentItems = parent.children;
  }
  return permissions;
}

export default function OrganizationRoleDetailPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string; roleKey: string; moduleKey?: string; navigationPath?: string[] }> }) {
  const router = useRouter();
  const [route, setRoute] = useState<{ workspaceId: string; organizationId: string; roleKey: string; moduleKey?: string; navigationPath?: string[] }>();
  const [role, setRole] = useState<Role>();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => { void params.then(setRoute); }, [params]);

  useEffect(() => {
    if (!route) return;
    let active = true;
    void fetch(`/api/organizations/${route.organizationId}/role-permissions/${route.roleKey}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load role.");
        if (active) setRole(payload.role);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "Unable to load role.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [route]);

  if (!route || loading) return <main className="p-4 md:p-8" role="status">Loading role...</main>;
  if (!role) return <main className="space-y-4 p-4 md:p-8"><p role="alert">{message || "Unable to load this role."}</p><Link className="font-semibold text-[var(--erp-brand)]" href={`/dashboard/${route.workspaceId}/organizations/${route.organizationId}/settings/roles`}>Back to roles</Link></main>;
  const loadedRoute = route;
  const loadedRole = role;
  const selectedModule = loadedRoute.moduleKey
    ? ERP_MODULES.find((module) => module.key === loadedRoute.moduleKey)
    : undefined;
  if (loadedRoute.moduleKey && !selectedModule) {
    return (
      <main className="space-y-4 p-4 md:p-8">
        <p role="alert">The selected platform module was not found.</p>
        <Link
          className="font-semibold text-[var(--erp-brand)]"
          href={`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles/${loadedRoute.roleKey}`}
        >
          Back to role
        </Link>
      </main>
    );
  }
  const moduleNavigationItems = selectedModule
    ? getOrganizationModuleNavigationItems(selectedModule.key)
    : [];
  const selectedNavigationItem = loadedRoute.navigationPath?.reduce<OrganizationModuleNavigationItem | undefined>(
    (current, key) => (current?.children ?? moduleNavigationItems).find((item) => item.key === key),
    undefined,
  );
  const invalidNavigationPath = Boolean(loadedRoute.navigationPath?.length && !selectedNavigationItem);
  if (invalidNavigationPath) {
    return (
      <main className="space-y-4 p-4 md:p-8">
        <p role="alert">The selected sidebar module was not found.</p>
        <Link
          className="font-semibold text-[var(--erp-brand)]"
          href={`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles/${loadedRoute.roleKey}/${loadedRoute.moduleKey}`}
        >
          Back to {selectedModule?.label}
        </Link>
      </main>
    );
  }
  const currentNavigationItems = selectedNavigationItem?.children ?? moduleNavigationItems;
  const enabledModuleCount = ERP_MODULES.filter((module) => {
    const permission = getOrganizationModuleAccessPermission(module.key);
    return permission ? loadedRole.permissions.includes(permission) : false;
  }).length;

  function toggleModuleAccess(moduleKey: string) {
    const permission = getOrganizationModuleAccessPermission(moduleKey);
    if (!permission) return;
    setRole((current) => current ? {
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((value) => value !== permission)
        : [...current.permissions, permission],
    } : current);
  }

  function toggleSubmoduleAccess(
    item: OrganizationModuleNavigationItem,
    enabled: boolean,
    ancestorPermissions: readonly OrganizationPermissionKey[],
  ) {
    const permissions = getNavigationAccessPermissions(item);
    setRole((current) => {
        if (!current) return current;
        const nextPermissions = new Set(current.permissions);
        for (const permission of permissions) {
          if (enabled) nextPermissions.add(permission);
          else nextPermissions.delete(permission);
        }
        if (enabled) {
          for (const permission of ancestorPermissions) nextPermissions.add(permission);
        }
        return { ...current, permissions: [...nextPermissions] };
    });
  }

  function getOrderManagementResource(item: OrganizationModuleNavigationItem): OrganizationOrderManagementResource | undefined {
    if (selectedModule?.key !== "order-management" || item.children.length > 0) return undefined;
    const resource = item.keyPath.join("/");
    const permission = getOrganizationOrderManagementPermission(
      resource as OrganizationOrderManagementResource,
      "view",
    );
    return permission ? resource as OrganizationOrderManagementResource : undefined;
  }

  function toggleOrderManagementAction(
    resource: OrganizationOrderManagementResource,
    action: OrganizationOrderManagementAction,
    enabled: boolean,
    item: OrganizationModuleNavigationItem,
    ancestorPermissions: readonly OrganizationPermissionKey[],
  ) {
    const permission = getOrganizationOrderManagementPermission(resource, action);
    if (!permission) return;
    setRole((current) => {
      if (!current) return current;
      const nextPermissions = new Set(current.permissions);
      if (enabled) {
        nextPermissions.add(permission);
        for (const ancestorPermission of ancestorPermissions) nextPermissions.add(ancestorPermission);
        nextPermissions.add(item.accessPermission);
      } else {
        nextPermissions.delete(permission);
      }
      return { ...current, permissions: [...nextPermissions] };
    });
  }

  function renderOrderManagementActionSwitches(
    item: OrganizationModuleNavigationItem,
    ancestorPermissions: readonly OrganizationPermissionKey[],
  ) {
    const resource = getOrderManagementResource(item);
    if (!resource) return null;
    return (
      <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 border-t border-[var(--erp-border)] pt-4">
        {ORDER_MANAGEMENT_ACTIONS.map((action) => {
          const permission = getOrganizationOrderManagementPermission(resource, action);
          const checked = Boolean(permission && loadedRole.permissions.includes(permission));
          return (
            <div key={action} className="flex min-w-0 items-center justify-between gap-2">
              <span className="text-sm font-medium capitalize text-[var(--erp-text)]">{action}</span>
              <Switch
                checked={checked}
                label={`${checked ? "Disable" : "Enable"} ${action} for ${item.label} for ${loadedRole.label}`}
                onCheckedChange={(enabled) => toggleOrderManagementAction(
                  resource,
                  action,
                  enabled,
                  item,
                  ancestorPermissions,
                )}
                disabled={loadedRole.role === "OWNER" || saving || !permission}
              />
            </div>
          );
        })}
        <p className="col-span-2 text-xs text-[var(--erp-muted)]">
          {resource === "merchandising/bom"
            ? "BOM changes are performed within Order create/edit workflows and follow those Order permissions."
            : "Unavailable actions are disabled because this workflow has no corresponding operation."}
        </p>
      </div>
    );
  }

  function renderSubmoduleCard(
    item: OrganizationModuleNavigationItem,
  ): ReactNode {
    const branchPermissions = getNavigationAccessPermissions(item);
    const enabled = branchPermissions.every((permission) => loadedRole.permissions.includes(permission));
    const navigationHref = `/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles/${loadedRoute.roleKey}/${selectedModule?.key}/${item.keyPath.join("/")}`;
    const moduleAccessPermission = selectedModule
      ? getOrganizationModuleAccessPermission(selectedModule.key)
      : undefined;
    const ancestorPermissions = [
      ...(moduleAccessPermission ? [moduleAccessPermission] : []),
      ...getNavigationAncestorPermissions(moduleNavigationItems, item.keyPath),
    ];
    return (
      <Card key={item.accessPermission}>
        <div className="flex min-w-0 items-center justify-between gap-4">
          <Link className="min-w-0 flex-1" href={navigationHref}>
            <h2 className="font-semibold text-[var(--erp-text)]">{item.label}</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {item.children.length > 0 ? `${item.children.length} sidebar modules` : "No nested sidebar modules"}
            </p>
          </Link>
          <Switch
            checked={enabled}
            label={`${enabled ? "Disable" : "Enable"} ${item.label} for ${loadedRole.label}`}
            onCheckedChange={(nextEnabled) => toggleSubmoduleAccess(item, nextEnabled, ancestorPermissions)}
            disabled={loadedRole.role === "OWNER" || saving}
          />
        </div>
        <p className="mt-3 text-sm text-[var(--erp-muted)]">{enabled ? "Access enabled" : "Access disabled"}</p>
        {renderOrderManagementActionSwitches(item, ancestorPermissions)}
      </Card>
    );
  }

  async function save() {
    if (saving || loadedRole.role === "OWNER") return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/organizations/${loadedRoute.organizationId}/role-permissions/${loadedRoute.roleKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: loadedRole.label, permissions: loadedRole.permissions }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save role.");
      setRole(payload.role);
      setMessage("Role permissions saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save role.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/organizations/${loadedRoute.organizationId}/role-permissions/${loadedRoute.roleKey}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to delete role.");
      router.push(`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete role.");
      setDeleteOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-6 p-4 md:p-8">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link className="font-semibold text-[var(--erp-brand)]" href={`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles`}>Roles</Link>
        <span className="mx-2 text-[var(--erp-muted)]">/</span>
        <Link
          className="font-semibold text-[var(--erp-brand)]"
          href={`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles/${loadedRoute.roleKey}`}
        >
          {loadedRole.label}
        </Link>
        {selectedModule && (
          <>
            <span className="mx-2 text-[var(--erp-muted)]">/</span>
            <Link
              className="font-semibold text-[var(--erp-brand)]"
              href={`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles/${loadedRoute.roleKey}/${selectedModule.key}`}
            >
              {selectedModule.label}
            </Link>
          </>
        )}
        {selectedNavigationItem && (
          <>
            <span className="mx-2 text-[var(--erp-muted)]">/</span>
            <span className="text-[var(--erp-text)]">{selectedNavigationItem.label}</span>
          </>
        )}
      </nav>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label htmlFor="role-name" className="mb-2 block text-sm font-medium text-[var(--erp-text)]">Role name</label>
            <Input
              id="role-name"
              value={loadedRole.label}
              disabled={loadedRole.isSystem}
              onChange={(event) => setRole((current) => current ? { ...current, label: event.target.value } : current)}
              className="max-w-xl"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {loadedRole.role !== "OWNER" && <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>}
            {!loadedRole.isSystem && <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>Delete role</Button>}
          </div>
        </div>
        {message && <p role="status" className="mt-4 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 text-sm text-[var(--erp-text)]">{message}</p>}
      </Card>

      {selectedModule ? (
        <section aria-labelledby="permission-heading" className="space-y-4">
          <div>
            <h1 id="permission-heading" className="text-xl font-semibold text-[var(--erp-text)]">
              {selectedNavigationItem?.label ?? selectedModule.label} sidebar modules
            </h1>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              Enable sidebar access and configure supported View, Create, Edit, and Delete actions for each Order Management workflow.
            </p>
          </div>
          {selectedNavigationItem
            && getOrderManagementResource(selectedNavigationItem)
            && (
              <Card>
                <h2 className="font-semibold text-[var(--erp-text)]">{selectedNavigationItem.label} actions</h2>
                {renderOrderManagementActionSwitches(
                  selectedNavigationItem,
                  [
                    ...(getOrganizationModuleAccessPermission(selectedModule.key)
                      ? [getOrganizationModuleAccessPermission(selectedModule.key)!]
                      : []),
                    ...getNavigationAncestorPermissions(moduleNavigationItems, selectedNavigationItem.keyPath),
                  ],
                )}
              </Card>
            )}
          {currentNavigationItems.length === 0 ? (
            selectedNavigationItem
              ? null
              : <Card><p className="text-sm text-[var(--erp-muted)]">No sidebar modules are registered for this platform module.</p></Card>
          ) : (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {currentNavigationItems.map((item) => renderSubmoduleCard(item))}
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby="permission-heading" className="space-y-4">
          <div>
            <h1 id="permission-heading" className="text-xl font-semibold text-[var(--erp-text)]">Master modules</h1>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {loadedRole.role === "OWNER"
                ? "Owner access is protected and cannot be changed."
                : `${enabledModuleCount} of ${ERP_MODULES.length} platform modules are enabled for this role. Platform and organization availability still applies.`}
            </p>
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ERP_MODULES.map((module) => {
              const permission = getOrganizationModuleAccessPermission(module.key);
              const enabled = permission ? loadedRole.permissions.includes(permission) : false;
              return (
                <Card key={module.key}>
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <Link
                      className="min-w-0 flex-1"
                      href={`/dashboard/${loadedRoute.workspaceId}/organizations/${loadedRoute.organizationId}/settings/roles/${loadedRoute.roleKey}/${module.key}`}
                      aria-label={`Configure ${module.label} sidebar modules`}
                    >
                      <h2 className="font-semibold text-[var(--erp-text)]">{module.label}</h2>
                      <p className="mt-1 text-sm text-[var(--erp-muted)]">Configure sidebar modules</p>
                    </Link>
                    <Switch
                      checked={enabled}
                      label={`${enabled ? "Disable" : "Enable"} ${module.label} for ${loadedRole.label}`}
                      onCheckedChange={() => toggleModuleAccess(module.key)}
                      disabled={loadedRole.role === "OWNER" || saving || !permission}
                    />
                  </div>
                  <p className="mt-3 text-sm text-[var(--erp-muted)]">{enabled ? "Access enabled" : "Access disabled"}</p>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} ariaLabel="Confirm role deletion" size="square" variant="danger">
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--erp-text)]">Delete role?</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Delete {loadedRole.label}? Active members and pending invitations must be reassigned first.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => void remove()} disabled={saving}>{saving ? "Deleting..." : "Delete role"}</Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
