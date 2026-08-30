import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function DistributionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Module ready</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">Distribution overview</h3>
        <p className="mt-3 max-w-3xl text-slate-600">
          This module page is ready for fleet movement, routes, stock transfers, and fulfillment management.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Routes", value: "23", tone: "emerald" },
          { label: "Dispatches", value: "184", tone: "sky" },
          { label: "On-time", value: "96%", tone: "violet" },
          { label: "Losses", value: "0.6%", tone: "amber" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{card.label}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">{card.value}</p>
            <div className="mt-3 h-2 rounded-full bg-emerald-100">
              <div
                className={`h-2 rounded-full ${
                  card.tone === "emerald"
                    ? "w-3/4 bg-emerald-500"
                    : card.tone === "sky"
                      ? "w-2/3 bg-sky-500"
                      : card.tone === "violet"
                        ? "w-4/5 bg-violet-500"
                        : "w-3/5 bg-amber-500"
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}