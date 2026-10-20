import Link from "next/link";
import { ArrowLeft, Bell } from "lucide-react";
import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listPlatformLeadActivity } from "@/lib/services/platform/platform-lead-service";

export default async function PlatformLeadActivityPage() {
  const admin = await requirePlatformSessionAdmin();
  if (
    admin.actualRole !== "SUPER_ADMIN"
    && admin.team_role !== "CMO"
    && admin.team_role !== "SALES_MANAGER"
    && !(admin.role === "ADMIN" && admin.team_role === null)
  ) {
    redirect("/platform/organisations");
  }

  const activity = await listPlatformLeadActivity();

  return (
    <section className="flex min-h-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/platform/leads"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--erp-text)] shadow-sm hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Leads
          </Link>
          <h1 className="truncate text-xl font-bold text-slate-900">
            Lead activity and notifications
          </h1>
        </div>
        <p className="text-sm text-slate-600">Latest {activity.length} of 100 events</p>
      </header>

      <p className="text-sm text-slate-600">
        Status changes, lead edits and imports, and recorded or uploaded voice notes.
      </p>

      {activity.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No lead activity has been recorded yet.
        </div>
      ) : (
        <ol className="min-w-0 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">
          {activity.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{item.summary}</p>
                  <p className="mt-1 break-words text-sm text-slate-600">
                    {item.leadName ?? "Lead unavailable"} · {item.actorEmail
                      ? `${item.actor} (${item.actorEmail})`
                      : item.actor}
                  </p>
                </div>
              </div>
              <time
                className="shrink-0 text-sm text-slate-500"
                dateTime={item.created_at.toISOString()}
              >
                {item.created_at.toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
