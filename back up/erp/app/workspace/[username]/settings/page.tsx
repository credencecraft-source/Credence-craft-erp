"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

type SelectedModule = "backup" | "users" | "profile";

type UserForm = {
  name: string;
  mobile: string;
  email: string;
};

type UserRecord = UserForm & {
  id: number;
};

const initialUserForm: UserForm = {
  name: "",
  mobile: "",
  email: "",
};

const initialUsers: UserRecord[] = [
  {
    id: 1,
    name: "Asha Kumar",
    mobile: "+91 98765 43210",
    email: "asha@credencecraft.com",
  },
  {
    id: 2,
    name: "Rohit Nair",
    mobile: "+91 91234 56789",
    email: "rohit@credencecraft.com",
  },
  {
    id: 3,
    name: "Meera Iyer",
    mobile: "+91 99887 66554",
    email: "meera@credencecraft.com",
  },
];

export default function UsernameWorkspaceSettingsPage() {
  const params = useParams<{ username?: string }>();
  const username = useMemo(() => (params?.username ? decodeURIComponent(params.username) : ""), [params?.username]);
  const [activeModule, setActiveModule] = useState<SelectedModule>("backup");
  const [form, setForm] = useState<UserForm>(initialUserForm);
  const [users, setUsers] = useState<UserRecord[]>(initialUsers);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name?: string; email?: string }>({});
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedName, setEditedName] = useState("");
  const workspaceBase = username ? `/workspace/${slugify(username)}` : "/workspace";
  const freeUserLimit = 5;

  useState(() => {
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.user) {
          setCurrentUser(payload.user);
          setEditedName(payload.user.name || "");
        }
      })
      .catch(() => undefined);
  });

  const usedUsers = users.length;
  const remainingUsers = Math.max(freeUserLimit - usedUsers, 0);

  const handleFieldChange = (field: keyof UserForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreateUser = () => {
    if (!form.name.trim() || !form.mobile.trim() || !form.email.trim()) {
      return;
    }

    const newUser: UserRecord = {
      id: Date.now(),
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      email: form.email.trim(),
    };

    setUsers((current) => [newUser, ...current]);
    setForm(initialUserForm);
    setShowCreateForm(false);
  };

  const handleSaveProfile = () => {
    const trimmedName = editedName.trim();
    if (!trimmedName) {
      return;
    }

    setCurrentUser((current) => ({ ...current, name: trimmedName }));
    setIsEditingProfile(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-[#dce4dc] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between border-b border-[#dce4dc] bg-[#f7faf7] px-4 py-3 sm:px-5">
          <Link
            href={workspaceBase}
            className="inline-flex items-center gap-2 rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-700/40 hover:text-emerald-800"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </Link>

          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Workspace settings</span>
        </div>

        <div className="flex min-h-[720px]">
          <aside className="w-full max-w-[240px] border-r border-[#dce4dc] bg-[#10251d] p-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Workspace</p>
            <h2 className="mt-3 text-xl font-semibold">Settings</h2>

            <nav className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => setActiveModule("backup")}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${activeModule === "backup" ? "bg-emerald-700 text-white" : "bg-white/5 text-emerald-50/80 hover:bg-white/10"}`}
              >
                Backup
              </button>

              <button
                type="button"
                onClick={() => setActiveModule("users")}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${activeModule === "users" ? "bg-emerald-700 text-white" : "bg-white/5 text-emerald-50/80 hover:bg-white/10"}`}
              >
                User
              </button>

              <button
                type="button"
                onClick={() => setActiveModule("profile")}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${activeModule === "profile" ? "bg-emerald-700 text-white" : "bg-white/5 text-emerald-50/80 hover:bg-white/10"}`}
              >
                Profile
              </button>
            </nav>
          </aside>

          <main className="flex-1 bg-[#f9fbf9] p-6 sm:p-8">
            {activeModule === "backup" ? (
              <div className="space-y-5">
                <header>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Module</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Backup</h1>
                </header>

                <section className="rounded-2xl border border-[#dce4dc] bg-white p-6 shadow-sm">
                  <p className="text-sm text-zinc-600">Backup configuration for this workspace will be added here later.</p>
                </section>
              </div>
            ) : activeModule === "profile" ? (
              <div className="space-y-5">
                <header>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Module</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Profile</h1>
                </header>

                <section className="rounded-2xl border border-[#dce4dc] bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-end">
                    {!isEditingProfile ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditedName(currentUser.name || "");
                          setIsEditingProfile(true);
                        }}
                        className="rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          className="rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingProfile(false)}
                          className="rounded-xl border border-[#dce4dc] bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-emerald-700/40 hover:text-emerald-800"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="grid size-16 place-items-center rounded-full bg-[#dfeedd] text-xl font-black text-[#17372a]">
                      {(currentUser.name ?? "Profile")
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? "")
                        .join("") || "SA"}
                    </div>

                    <div className="w-full space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Registered name</p>
                        {isEditingProfile ? (
                          <input
                            value={editedName}
                            onChange={(event) => setEditedName(event.target.value)}
                            className="mt-2 w-full rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-lg font-semibold text-[#17372a] outline-none transition focus:border-emerald-700"
                            placeholder="Enter super admin name"
                          />
                        ) : (
                          <p className="mt-2 text-2xl font-semibold text-[#17372a]">{currentUser.name || "Profile"}</p>
                        )}
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Registered email id</p>
                        <input
                          type="email"
                          value={currentUser.email || ""}
                          disabled
                          className="mt-2 w-full rounded-xl border border-[#dfe8df] bg-[#f3f5f3] px-3 py-3 text-base text-zinc-500 outline-none cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-5">
                <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Module</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">User</h1>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <div className="rounded-xl border border-[#dce4dc] bg-[#f1f8f3] px-4 py-2.5 text-sm text-zinc-700">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#17372a]">{freeUserLimit} users free</span>
                        <span className="text-zinc-400">•</span>
                        <span>{usedUsers} used</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">{remainingUsers} left in free plan</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCreateForm((current) => !current)}
                      className="rounded-xl bg-[#17372a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#214d3a]"
                    >
                      {showCreateForm ? "Close" : "Add user"}
                    </button>
                  </div>
                </header>

                {showCreateForm && (
                  <section className="rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-sm">
                    <div className="grid gap-4 md:grid-cols-3">
                      <input
                        value={form.name}
                        onChange={(event) => handleFieldChange("name", event.target.value)}
                        placeholder="Name"
                        className="rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-sm outline-none focus:border-emerald-700"
                      />
                      <input
                        value={form.mobile}
                        onChange={(event) => handleFieldChange("mobile", event.target.value)}
                        placeholder="Mobile"
                        className="rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-sm outline-none focus:border-emerald-700"
                      />
                      <input
                        value={form.email}
                        onChange={(event) => handleFieldChange("email", event.target.value)}
                        placeholder="Email"
                        className="rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-sm outline-none focus:border-emerald-700"
                      />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={handleCreateUser}
                        className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                      >
                        Save user
                      </button>
                    </div>
                  </section>
                )}

                <section className="overflow-hidden rounded-2xl border border-[#dce4dc] bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-[#edf2ee] text-left text-sm text-zinc-700">
                    <thead className="bg-[#f7faf7] text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Mobile</th>
                        <th className="px-4 py-3">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2ee]">
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td className="px-4 py-3 font-medium text-[#17372a]">{user.name}</td>
                          <td className="px-4 py-3">{user.mobile}</td>
                          <td className="px-4 py-3">{user.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
