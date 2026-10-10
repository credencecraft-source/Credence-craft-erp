"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function WorkspaceConfigurationSidebar({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const pathname = usePathname();
  const configurationPath = `/dashboard/${workspaceId}/configuration`;
  const linkClassName = (active: boolean) =>
    `block rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
      active
        ? "bg-emerald-50 text-emerald-800"
        : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
    }`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs lg:sticky lg:top-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
        Workspace configuration
      </p>
      <nav aria-label="Workspace configuration" className="mt-4 space-y-1">
        <Link
          href={configurationPath}
          className={linkClassName(pathname === configurationPath)}
        >
          Profile & workspace
        </Link>
        <Link
          href={`${configurationPath}/usage`}
          className={linkClassName(pathname.startsWith(`${configurationPath}/usage`))}
        >
          Usage
        </Link>
      </nav>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <Link
          href={`/dashboard/${workspaceId}/home`}
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}