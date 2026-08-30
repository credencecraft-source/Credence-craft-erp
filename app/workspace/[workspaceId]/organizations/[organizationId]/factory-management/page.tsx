import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function FactoryManagementPage({
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
      value="factory-management"
      moduleLabel="Factory Management"
      title="Factory Management dashboard"
      description="This module page is ready for production planning, work-order tracking, quality checks, and operational control."
      subItems={[]}
    >
      <div >
        <div >
          <p >Module ready</p>
          <h3 >Factory Management overview</h3>
          <p >
            This module page is ready for production planning, work-order tracking, quality checks, and operational control.
          </p>
        </div>

        <div >
          {[
            { label: "Production Lines", value: "12", tone: "emerald" },
            { label: "Running Orders", value: "48", tone: "sky" },
            { label: "Efficiency", value: "86%", tone: "violet" },
            { label: "Defects", value: "1.9%", tone: "amber" },
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
