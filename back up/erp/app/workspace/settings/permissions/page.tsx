"use client";

import Link from "next/link";
import { useState } from "react";

type PermissionState = { read: boolean; write: boolean; delete: boolean };
type PermissionMap = Record<string, PermissionState>;

const moduleKeys = [
  "order-management",
  "merchandising",
  "purchase",
  "masters",
  "entities",
  "vendors",
  "settings",
] as const;

const tableKeys = ["users", "vendors", "tenants", "orders", "backups", "audit"] as const;

function buildDefaultModulePermissions(): PermissionMap {
  return Object.fromEntries(
    moduleKeys.map((key) => [key, { read: true, write: true, delete: true }])
  ) as PermissionMap;
}

function buildDefaultTablePermissions(): PermissionMap {
  return Object.fromEntries(
    tableKeys.map((key) => [key, { read: true, write: true, delete: true }])
  ) as PermissionMap;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

export default function PermissionSettingsPage() {
  const [roleName, setRoleName] = useState("Operations Lead");
  const [modulePermissions, setModulePermissions] = useState<PermissionMap>(buildDefaultModulePermissions());
  const [tablePermissions, setTablePermissions] = useState<PermissionMap>(buildDefaultTablePermissions());
  const [message, setMessage] = useState("");
  const [workspaceBase, setWorkspaceBase] = useState("/workspace");

  useState(() => {
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const userName = (payload?.user?.name ?? "").trim();
        if (userName) {
          setWorkspaceBase(`/workspace/${slugify(userName)}`);
        }
      })
      .catch(() => undefined);
  });

  const togglePermission = (
    map: PermissionMap,
    key: string,
    access: "read" | "write" | "delete",
    setter: (next: PermissionMap) => void
  ) => {
    const next = {
      ...map,
      [key]: {
        ...map[key],
        [access]: !map[key][access],
      },
    };
    setter(next);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(`Permission role "${roleName.trim() || "New role"}" saved successfully.`);
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[#dce4dc] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between border-b border-[#dce4dc] bg-[#f7faf7] px-4 py-3 sm:px-5">
          <Link
            href={`${workspaceBase}/settings`}
            className="inline-flex items-center gap-2 rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-700/40 hover:text-emerald-800"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to settings
          </Link>

          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Permission setup</span>
        </div>

        <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
          <aside className="border-b border-[#dce4dc] bg-[#10251d] p-4 text-white lg:border-b-0 lg:border-r">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Organization</p>
            <h2 className="mt-3 text-xl font-semibold">Settings</h2>

            <nav className="mt-6 space-y-2">
              <Link href={`${workspaceBase}/settings`} className="block rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm font-medium text-emerald-50/80 transition hover:bg-white/10">
                Backup
              </Link>
              <Link href={`${workspaceBase}/settings`} className="block rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm font-medium text-emerald-50/80 transition hover:bg-white/10">
                User
              </Link>
              <Link href={`${workspaceBase}/settings/permissions`} className="block rounded-xl bg-emerald-700 px-3 py-2.5 text-left text-sm font-medium text-white transition hover:bg-emerald-800">
                Permission
              </Link>
            </nav>
          </aside>

          <main className="bg-[#f9fbf9] p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Role control</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Permission matrix</h1>
                </div>
                <div className="rounded-full bg-[#edf5ee] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-800">
                  Default open
                </div>
              </header>

              {message ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>
              ) : null}

              <section className="rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-sm">
                <label className="block text-sm font-medium text-zinc-700">
                  <span className="mb-2 block">Role name</span>
                  <input
                    value={roleName}
                    onChange={(event) => setRoleName(event.target.value)}
                    placeholder="Operations Lead"
                    className="w-full rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-sm text-zinc-800 outline-none transition focus:border-emerald-700"
                  />
                </label>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-sm">
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold text-[#17372a]">Module permissions</h2>
                  </div>

                  <div className="space-y-2">
                    {moduleKeys.map((key) => (
                      <div key={key} className="grid grid-cols-[1.5fr_repeat(3,minmax(0,0.5fr))] items-center gap-2 rounded-xl border border-[#edf2ee] bg-[#f9fbf9] px-2 py-2">
                        <span className="truncate text-sm text-zinc-700">{key}</span>
                        {(["read", "write", "delete"] as const).map((access) => (
                          <button
                            key={`${key}-${access}`}
                            type="button"
                            onClick={() => togglePermission(modulePermissions, key, access, setModulePermissions)}
                            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${modulePermissions[key][access] ? "bg-emerald-600 text-white" : "bg-white text-zinc-500"}`}
                          >
                            {access}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-sm">
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold text-[#17372a]">Table permissions</h2>
                  </div>

                  <div className="space-y-2">
                    {tableKeys.map((key) => (
                      <div key={key} className="grid grid-cols-[1.5fr_repeat(3,minmax(0,0.5fr))] items-center gap-2 rounded-xl border border-[#edf2ee] bg-[#f9fbf9] px-2 py-2">
                        <span className="truncate text-sm text-zinc-700">{key}</span>
                        {(["read", "write", "delete"] as const).map((access) => (
                          <button
                            key={`${key}-${access}`}
                            type="button"
                            onClick={() => togglePermission(tablePermissions, key, access, setTablePermissions)}
                            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tablePermissions[key][access] ? "bg-emerald-600 text-white" : "bg-white text-zinc-500"}`}
                          >
                            {access}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-xl bg-[#17372a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#214d3a]"
                >
                  Save permission role
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
