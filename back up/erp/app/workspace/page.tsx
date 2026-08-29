"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

export default function WorkspaceIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) {
          setLoading(false);
          return;
        }

        const payload = await response.json();
        const profileName = (payload?.user?.profileName || payload?.user?.name || "").trim();

        if (profileName) {
          router.replace(`/workspace/${slugify(profileName)}`);
          return;
        }

        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
        <div className="mx-auto max-w-xl rounded-2xl border border-[#dfe8df] bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-xl rounded-2xl border border-[#dfe8df] bg-white p-8 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Workspace</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#17372a]">No active workspace</h1>
        <p className="mt-3 text-sm text-zinc-600">Please log in to continue to your workspace dashboard.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-[#17372a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#214d3a]">
          Go to login
        </Link>
      </div>
    </div>
  );
}
