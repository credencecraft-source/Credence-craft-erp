import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function PurchasePage({
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
        <p >Purchase</p>
        <h3 >Purchase overview</h3>
      </div>

      <div >
        {[
          { label: "Purchase Orders", value: "164", tone: "emerald" },
          { label: "Pending Inward", value: "42", tone: "sky" },
          { label: "Supplier On-Time", value: "96%", tone: "violet" },
          { label: "Avg. Cost", value: "₹8.2K", tone: "amber" },
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