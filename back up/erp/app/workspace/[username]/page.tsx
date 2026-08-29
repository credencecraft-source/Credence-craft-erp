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

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 220) || "Server returned an unexpected response.");
  }
}

type OrganizationCard = {
  id: string;
  name: string;
  createdBy?: string | null;
  status?: string;
};

export default function UsernameWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ username?: string }>();
  const [ownedOrganizations, setOwnedOrganizations] = useState<OrganizationCard[]>([]);
  const [sharedOrganizations, setSharedOrganizations] = useState<OrganizationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionName, setSessionName] = useState("");
  const [sessionUserId, setSessionUserId] = useState("");
  const [sessionProfileName, setSessionProfileName] = useState("");

  const username = useMemo(() => {
    const raw = params?.username ?? "";
    return raw ? decodeURIComponent(raw) : "";
  }, [params?.username]);

  const buildOrgRoute = (organization: OrganizationCard) => {
    const workspaceSlug = slugify(sessionProfileName || sessionName || username || "workspace");
    return organization.id ? `/workspace/${workspaceSlug}/${organization.id}` : `/workspace/${workspaceSlug}/organization`;
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      document.cookie = "erp_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
      router.push("/");
      router.refresh();
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadWorkspaceData = async () => {
      try {
        const [sessionResponse, organizationsResponse] = await Promise.all([
          fetch("/api/auth/session"),
          fetch("/api/workspaces"),
        ]);

        if (!isActive) return;

        const sessionPayload = sessionResponse.ok ? await sessionResponse.json() : {};
        const userName = (sessionPayload?.user?.name ?? "").trim();
        const profileName = (sessionPayload?.user?.profileName ?? "").trim();
        const userId = (sessionPayload?.user?.id ?? "").trim();

        setSessionName(userName);
        setSessionProfileName(profileName);
        setSessionUserId(userId);

        const workspacePayload = await parseJsonResponse(organizationsResponse);
        const list = Array.isArray(workspacePayload?.data) ? workspacePayload.data : [];

        const resolveOwned = Array.isArray(workspacePayload?.ownedOrganizations) && workspacePayload.ownedOrganizations.length > 0
          ? workspacePayload.ownedOrganizations
          : list.filter((organization: OrganizationCard) => organization.createdBy === userId);

        setOwnedOrganizations(resolveOwned);
        setSharedOrganizations([]);
      } catch {
        if (!isActive) return;
        setOwnedOrganizations([]);
        setSharedOrganizations([]);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadWorkspaceData();

    return () => {
      isActive = false;
    };
  }, []);

  const currentUserSlug = slugify(sessionProfileName || sessionName || username || "workspace");

  useEffect(() => {
    if (!username || !sessionProfileName && !sessionName) return;
    const expected = slugify(sessionProfileName || sessionName);
    if (slugify(username) !== expected) {
      router.replace(`/workspace/${expected}`);
    }
  }, [router, sessionName, sessionProfileName, username]);

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#dce4dc] bg-[#17372a] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/75">Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Workspace dashboard</h1>
            <p className="mt-2 text-sm text-emerald-100/80">Signed in as {sessionName || username || currentUserSlug}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-right">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Profile Name</div>
              <div className="mt-1 text-sm font-medium text-white">{sessionProfileName || sessionName || username || currentUserSlug}</div>
            </div>
            <Link href={`/workspace/${currentUserSlug}/settings`} className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 p-2 text-zinc-100 transition hover:bg-white/10" aria-label="Open workspace settings" title="Workspace settings">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M10 3.2a1.8 1.8 0 0 1 1.7 1.2l.2.5a6.8 6.8 0 0 1 1.1.5l.5-.2a1.8 1.8 0 1 1 1.9 3.1l-.5.2c.2.4.4.7.5 1.1l.5.2a1.8 1.8 0 0 1-1 3.2l-.5-.2a6.8 6.8 0 0 1-.5 1.1l.2.5a1.8 1.8 0 0 1-3.1 1.9l-.2-.5c-.4.2-.7.4-1.1.5l-.2.5a1.8 1.8 0 0 1-3.2-1l.2-.5a6.8 6.8 0 0 1-1.1-.5l-.5.2a1.8 1.8 0 1 1-1.9-3.1l.5-.2c-.2-.4-.4-.7-.5-1.1l-.5-.2a1.8 1.8 0 0 1 1-3.2l.5.2c.2-.4.4-.7.5-1.1l-.2-.5a1.8 1.8 0 0 1 3.1-1.9l.2.5c.4-.2.7-.4 1.1-.5l.2-.5a1.8 1.8 0 0 1 3.2 1ZM10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href={`/workspace/${currentUserSlug}/organization/new`} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#17372a] transition hover:bg-emerald-50">Create organisation</Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-600 hover:text-white"
            >
              Log out
            </button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-[#dce4dc] bg-white p-6 text-sm text-zinc-500">Loading organisations...</div>
        ) : ownedOrganizations.length === 0 && sharedOrganizations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dce4dc] bg-white p-8 text-center">
            <p className="text-lg font-semibold text-[#17372a]">No organisation yet</p>
            <p className="mt-2 text-sm text-zinc-600">Create your first organisation to continue.</p>
            <Link href={`/workspace/${currentUserSlug}/organization/new`} className="mt-5 inline-flex rounded-xl bg-[#17372a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#214d3a]">Create organisation</Link>
          </div>
        ) : (
          <div className="space-y-6">
            <Section title="Owned organizations" organizations={ownedOrganizations} buildOrgRoute={buildOrgRoute} />
            <Section title="Shared organizations" organizations={sharedOrganizations} buildOrgRoute={buildOrgRoute} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  organizations,
  buildOrgRoute,
}: {
  title: string;
  organizations: OrganizationCard[];
  buildOrgRoute: (organization: OrganizationCard) => string;
}) {
  if (organizations.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">{title}</h2>
      </div>

      {organizations.map((organization) => (
        <div key={organization.id} className="flex flex-col gap-4 rounded-2xl border border-[#dfe8df] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href={buildOrgRoute(organization)} className="inline-block text-xl font-semibold text-[#17372a] transition hover:text-emerald-800">
              {organization.name}
            </Link>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#edf5ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                Organization
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#eaf7ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">{organization.status || "Active"}</span>
            <Link href={buildOrgRoute(organization)} className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-emerald-700/40 hover:text-emerald-800">Open org</Link>
          </div>
        </div>
      ))}
    </section>
  );
}
