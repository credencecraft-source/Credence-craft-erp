import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";
import { MASTER_DEFINITIONS } from "@/lib/master-data";

export default async function MastersPage({
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
        <p >Master registry</p>
        <h3 >All master modules</h3>
        <p >
          This is the central list for all ERP masters. Add any new master here and use it across order forms, subforms, and downstream modules.
        </p>
      </div>

      <div >
        {MASTER_DEFINITIONS.map((master) => (
          <Link
            key={master.key}
            href={`/workspace/${workspaceId}/organizations/${organizationId}/settings/masters/${master.key}`}
            
          >
            <div >
              <p >Master</p>
              <span >Active</span>
            </div>
            <h4 >{master.label}</h4>
            <p >{master.description}</p>
            <div >
              <span>Open module</span>
              <span aria-hidden="true" >→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}