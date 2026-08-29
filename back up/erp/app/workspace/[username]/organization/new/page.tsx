"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

export default function UsernameNewOrganizationPage() {
  const router = useRouter();
  const params = useParams<{ username?: string }>();
  const username = useMemo(() => (params?.username ? decodeURIComponent(params.username) : ""), [params?.username]);
  const [form, setForm] = useState({
    name: "",
    shortCode: "",
    primaryContactName: "",
    email: "",
    businessType: "",
    location: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [workspaceBase, setWorkspaceBase] = useState("/workspace");

  useEffect(() => {
    const base = username ? `/workspace/${slugify(username)}` : "/workspace";
    setWorkspaceBase(base);

    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const profileName = (payload?.user?.profileName ?? payload?.user?.name ?? "").trim();
        const resolved = profileName ? `/workspace/${slugify(profileName)}` : base;
        setWorkspaceBase(resolved);

        const routeUsername = username ? slugify(username) : "";
        const currentProfileSlug = profileName ? slugify(profileName) : routeUsername;

        if (routeUsername && currentProfileSlug && routeUsername !== currentProfileSlug) {
          router.replace(resolved);
        }
      })
      .catch(() => undefined);
  }, [router, username]);

  const handleSubmit = async () => {
    if (!form.name || !form.email) {
      setMessage("Organisation name and primary email are required.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to create organization.");
      }

      const createdOrganizationId = typeof payload?.organization?.id === "string" ? payload.organization.id : "";
      const targetWorkspace = workspaceBase && workspaceBase !== "/workspace" ? workspaceBase : `/workspace/${slugify(username || "workspace")}`;

      setMessage("Organization created successfully.");
      router.push(createdOrganizationId ? `${targetWorkspace}/${createdOrganizationId}` : `${targetWorkspace}/organization`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#dce4dc] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Create organisation</h1>
          <p className="mt-2 text-sm text-zinc-600">Each organization operates independently, with its own users, modules, and data boundaries.</p>
        </div>

        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Organisation name" placeholder="Ex: Credence Craft" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
            <Field label="Short code" placeholder="CC" value={form.shortCode} onChange={(value) => setForm((current) => ({ ...current, shortCode: value }))} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Primary contact name" placeholder="Owner / admin name" value={form.primaryContactName} onChange={(value) => setForm((current) => ({ ...current, primaryContactName: value }))} />
            <Field label="Email address" type="email" placeholder="admin@company.com" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Business type" placeholder="Manufacturing / trading / retail" value={form.businessType} onChange={(value) => setForm((current) => ({ ...current, businessType: value }))} />
            <Field label="Location" placeholder="City / state / country" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} />
          </div>

          <div className="rounded-2xl border border-dashed border-[#dfe8df] bg-[#f9fbf9] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Module selection</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Order Management",
                "Factory Management",
                "Finance Management",
                "Distribution",
                "Retail",
              ].map((module) => (
                <span key={module} className="rounded-full border border-[#dfe8df] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700">{module}</span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#dfe8df] bg-[#edf5ee] p-4 text-sm text-zinc-700">
            <p className="font-semibold text-[#17372a]">Default access model</p>
            <p className="mt-2">The registration user becomes the super admin. The super admin can assign admins, and admins cannot remove the super admin.</p>
          </div>

          {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link href={workspaceBase || "/workspace"} className="rounded-xl border border-[#dce4dc] bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-700/40 hover:text-emerald-800">Cancel</Link>
            <button type="button" onClick={handleSubmit} disabled={loading} className="rounded-xl bg-[#17372a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#214d3a] disabled:cursor-not-allowed disabled:opacity-70">{loading ? "Creating..." : "Create organisation"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, type = "text", placeholder, value, onChange }: { label: string; type?: string; placeholder: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
      <span className="mb-2 block">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#dfe8df] bg-[#fbfdfb] px-3 py-3 text-sm text-zinc-800 outline-none transition focus:border-emerald-700"
      />
    </label>
  );
}
