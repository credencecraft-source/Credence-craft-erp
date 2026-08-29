"use client";

import { useEffect, useMemo, useState } from "react";

type PermissionValue = "read" | "write" | "delete" | "approve";
type TablePermissionMap = Record<string, Record<PermissionValue, boolean>>;

type RoleRecord = {
  id: string;
  name: string;
  tablePermissions?: Record<string, Record<PermissionValue, boolean>>;
};

const permissionValues: PermissionValue[] = ["read", "write", "delete", "approve"];

function buildDefaultModulePermissions() {
  return {
    "order-management": { read: true, write: true, delete: true },
    merchandising: { read: true, write: true, delete: true },
    purchase: { read: true, write: true, delete: true },
    "factory-management": { read: true, write: true, delete: true },
    "finance-management": { read: true, write: true, delete: true },
    retail: { read: true, write: true, delete: true },
    distribution: { read: true, write: true, delete: true },
    "settings-and-control": { read: true, write: true, delete: true },
    masters: { read: true, write: true, delete: true },
    permission: { read: true, write: true, delete: true },
    subscription: { read: true, write: true, delete: true },
    entities: { read: true, write: true, delete: true },
    vendors: { read: true, write: true, delete: true },
    settings: { read: true, write: true, delete: true },
  };
}

function buildDefaultTablePermissions(tables: string[]): TablePermissionMap {
  return Object.fromEntries(
    tables.map((table) => [
      table,
      {
        read: true,
        write: true,
        delete: false,
        approve: false,
      },
    ])
  );
}

function normalizeTablePermissions(tables: string[], source?: Record<string, Record<PermissionValue, boolean>>): TablePermissionMap {
  const defaults = buildDefaultTablePermissions(tables);
  if (!source) return defaults;

  return Object.fromEntries(
    tables.map((table) => {
      const existing = source[table];
      const next = { ...defaults[table] };

      if (existing && typeof existing === "object") {
        for (const permission of permissionValues) {
          next[permission] = Boolean(existing[permission]);
        }
      }

      return [table, next];
    })
  );
}

export function PermissionEditor({ organizationId, tables }: { organizationId: string; tables: string[] }) {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("Operations Lead");
  const [tablePermissions, setTablePermissions] = useState<TablePermissionMap>(buildDefaultTablePermissions(tables));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const totalEnabled = useMemo(
    () => Object.values(tablePermissions).reduce((sum, perms) => sum + permissionValues.filter((permission) => perms[permission]).length, 0),
    [tablePermissions]
  );

  const loadRoles = async () => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/roles`);
      if (!response.ok) {
        throw new Error("Unable to load saved permission roles.");
      }

      const payload = await response.json();
      const items = Array.isArray(payload?.data) ? payload.data : [];
      setRoles(items);

      if (items.length > 0) {
        const first = items[0];
        setSelectedRoleId(first.id ?? null);
        setRoleName(first.name ?? "Operations Lead");
        setTablePermissions(normalizeTablePermissions(tables, first.tablePermissions));
      } else {
        setSelectedRoleId(null);
        setRoleName("Operations Lead");
        setTablePermissions(buildDefaultTablePermissions(tables));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoles();
  }, [organizationId, tables.join(",")]);

  const handleSelectRole = (role: RoleRecord) => {
    setSelectedRoleId(role.id ?? null);
    setRoleName(role.name ?? "Untitled role");
    setTablePermissions(normalizeTablePermissions(tables, role.tablePermissions));
  };

  const handleNewPermission = () => {
    setSelectedRoleId(null);
    setRoleName("");
    setTablePermissions(buildDefaultTablePermissions(tables));
  };

  const togglePermission = (table: string, permission: PermissionValue) => {
    setTablePermissions((previous) => ({
      ...previous,
      [table]: {
        ...previous[table],
        [permission]: !previous[table]?.[permission],
      },
    }));
  };

  const handleSave = async () => {
    const trimmedName = roleName.trim();
    if (!trimmedName) {
      window.alert("Please enter a permission role name.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        id: selectedRoleId ?? undefined,
        name: trimmedName,        modulePermissions: buildDefaultModulePermissions(),        tablePermissions: Object.fromEntries(
          Object.entries(tablePermissions).map(([table, permissions]) => [
            table,
            Object.fromEntries(permissionValues.map((permission) => [permission, Boolean(permissions[permission])])),
          ])
        ),
      };

      const response = await fetch(`/api/organizations/${organizationId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to save permission role.");
      }

      const result = await response.json();
      const savedRole = result.role;
      if (savedRole) {
        setRoles((current) => {
          const filtered = current.filter((role) => role.id !== savedRole.id);
          return [savedRole, ...filtered];
        });
        setSelectedRoleId(savedRole.id);
        setRoleName(savedRole.name || trimmedName);
        setTablePermissions(normalizeTablePermissions(tables, savedRole.tablePermissions));
      }
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Unable to save the permission role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Saved records</p>
          <h2 className="mt-1 text-xl font-semibold text-[#17372a]">Permission roles</h2>
        </div>
        <button
          type="button"
          onClick={handleNewPermission}
          className="inline-flex items-center justify-center rounded-xl bg-[#17372a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#214b38]"
        >
          + Add new permission
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Records</span>
            <span className="rounded-full border border-[#dce4dc] bg-white px-2 py-1 text-[10px] font-semibold text-zinc-600">{roles.length}</span>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading saved permission records...</p>
          ) : roles.length === 0 ? (
            <p className="text-sm text-zinc-500">No permission roles saved yet.</p>
          ) : (
            <div className="space-y-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSelectRole(role)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selectedRoleId === role.id
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-[#dce4dc] bg-white text-zinc-700 hover:border-emerald-700/40"
                  }`}
                >
                  <div className="text-sm font-semibold">{role.name || "Untitled role"}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Saved role</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="space-y-5">
          <section className="surface p-5">
            <div className="grid gap-5 md:grid-cols-[1fr_220px]">
              <label className="block text-sm font-medium text-zinc-700">
                <span className="mb-2 block">Role name</span>
                <input
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                  placeholder="Enter role name"
                  className="w-full rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-emerald-700"
                />
              </label>

              <div className="rounded-2xl border border-[#dce4dc] bg-[#f7faf7] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Summary</p>
                <p className="mt-2 text-sm text-zinc-600">{totalEnabled} access flags enabled across {tables.length} tables.</p>
              </div>
            </div>
          </section>

          <section className="surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#dce4dc] bg-[#f7faf7] px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Live tables</p>
                <h2 className="mt-1 text-xl font-semibold text-[#17372a]">Table permissions</h2>
              </div>
              <span className="rounded-full border border-[#cddbcf] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">
                {tables.length} tables
              </span>
            </div>

            <div className="space-y-3">
              {tables.map((table) => (
                <div key={table} className="rounded-2xl border border-[#edf2ee] bg-[#f9fbf9] p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <span className="text-sm font-medium text-zinc-700">{table}</span>
                    <div className="flex flex-wrap gap-2">
                      {permissionValues.map((permission) => {
                        const selected = Boolean(tablePermissions[table]?.[permission]);
                        return (
                          <button
                            key={`${table}-${permission}`}
                            type="button"
                            onClick={() => togglePermission(table, permission)}
                            className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                              selected
                                ? "bg-[#17372a] text-white"
                                : "border border-[#dce4dc] bg-white text-zinc-600 hover:border-emerald-700/40 hover:text-emerald-800"
                            }`}
                          >
                            {permission}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end">
            <button type="button" onClick={handleSave} disabled={saving} className="button-primary disabled:cursor-not-allowed disabled:opacity-70">
              {saving ? "Saving..." : "Save permission role"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
