import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function OnlinePage({
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
        <h3 >Digital commerce overview</h3>
        <p >
          This module page is ready for e-commerce, marketplace, digital sales, and online channel operations.
        </p>
      </div>

      <div >
        {[
          { label: "Orders", value: "1,214", tone: "emerald" },
          { label: "Conversion", value: "3.8%", tone: "sky" },
          { label: "Avg. Order", value: "₹2,160", tone: "violet" },
          { label: "Bounce", value: "18%", tone: "amber" },
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