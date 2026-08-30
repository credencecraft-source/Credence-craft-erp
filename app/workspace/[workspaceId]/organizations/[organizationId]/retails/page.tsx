import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function RetailsPage({
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
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      value="retails"
      moduleLabel="Retails"
      title="Retails dashboard"
      description="This module page is ready for POS, billing, customer activity, promotions, and retail operations."
      subItems={[]}
    >
      <div >
        <div >
          <p >Module ready</p>
          <h3 >Retail operations overview</h3>
          <p >
            This module page is ready for POS, billing, customer activity, promotions, and retail operations.
          </p>
        </div>

        <div >
          {[
            { label: "Stores", value: "18", tone: "emerald" },
            { label: "Avg. Basket", value: "₹1,680", tone: "sky" },
            { label: "Conversion", value: "42%", tone: "violet" },
            { label: "Returns", value: "2.4%", tone: "amber" },
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
    </MasterModuleShell>
  );
}
