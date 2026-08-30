import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function ApprovalHomePage({
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

  const approvalModules: Array<{ title: string; description: string; href: string }> = [];

  return (
    <div >
      <div >
        <p >Central approval</p>
        <h3 >Approval center</h3>
        <p >
          This is the central approval workspace for the ERP. The current scope focuses on master approval flow, while the rest of the modules can be connected later as needed.
        </p>
      </div>

      <div >
        {approvalModules.map((module) => (
          <Link
            key={module.title}
            href={module.href}
            
          >
            <p >Module</p>
            <h4 >{module.title}</h4>
            <p >{module.description}</p>
            <div >
              <span>Open queue</span>
              <span aria-hidden="true" >→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}