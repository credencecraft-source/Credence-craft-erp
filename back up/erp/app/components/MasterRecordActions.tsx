"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MasterRecordActions({ editHref, deleteUrl, label }: { editHref: string; deleteUrl: string; label: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeleting(true);
    const response = await fetch(deleteUrl, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      window.alert(data.error ?? "This record cannot be deleted");
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return <div className="flex shrink-0 items-center gap-2"><Link href={editHref} className="rounded-md border border-[#dce4dc] px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:border-emerald-700/40 hover:text-emerald-800">Edit</Link><button type="button" onClick={handleDelete} disabled={deleting} className="rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{deleting ? "..." : "Delete"}</button></div>;
}