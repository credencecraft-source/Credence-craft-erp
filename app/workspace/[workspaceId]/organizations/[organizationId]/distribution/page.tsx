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
    <div >
      <div >
        <p >Module ready</p>
        <h3 >Distribution overview</h3>
        <p >
          This module page is ready for fleet movement, routes, stock transfers, and fulfillment management.
        </p>
      </div>

      <div >
        {[
          { label: "Routes", value: "23", tone: "emerald" },
          { label: "Dispatches", value: "184", tone: "sky" },
          { label: "On-time", value: "96%", tone: "violet" },
          { label: "Losses", value: "0.6%", tone: "amber" },
        ].map((card) => (
          <div key={card.label} >
            <p >{card.label}</p>
            <p >{card.value}</p>
            <div >
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