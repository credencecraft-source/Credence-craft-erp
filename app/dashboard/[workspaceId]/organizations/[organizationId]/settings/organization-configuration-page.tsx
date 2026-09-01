import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export default async function OrganizationConfigurationPage({
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
        <h3 >System configuration overview</h3>
        <p >
          This module page is ready for company configuration, roles, permissions, integrations, and governance controls.
        </p>
      </div>

      <div >
        {[
          { label: "Users", value: "42", tone: "emerald" },
          { label: "Roles", value: "11", tone: "sky" },
          { label: "Integrations", value: "8", tone: "violet" },
          { label: "Audit", value: "99%", tone: "amber" },
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

      <div >
        <div >
          <div>
            <p >Master data</p>
            <h3 >Master modules</h3>
          </div>
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data`}
            
          >
            Open masters
          </Link>
        </div>

        <div >
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/approvals`}
            
          >
            <p >Central approval</p>
            <h4 >Centralized approvals</h4>
            <p >Track the approval workflow by module with dedicated sub-tabs for key ERP areas.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
