import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

const ORDER_HOME_MODULES = [
  {
    title: "Merchandising",
    description: "Merchandising operations and product planning.",
    href: "merchandising",
  },
  {
    title: "Purchase",
    description: "Purchase operations and supplier workflow.",
    href: "purchase",
  },
] as const;

export default async function OrderManagementHomePage({
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
        {ORDER_HOME_MODULES.map((module) => (
          <Link
            key={module.title}
            href={`/workspace/${workspaceId}/organizations/${organizationId}/order-management/${module.href}`}
            
          >
            <p >Module</p>
            <h4 >{module.title}</h4>
            <p >{module.description}</p>
            <div >
              <span>Open</span>
              <span aria-hidden="true" >→</span>
            </div>
          </Link>
        ))}
      </div>

      <div >
        <p >Open orders</p>
        <div >
          <p >1,482</p>
          <span >
            Live
          </span>
        </div>
      </div>
    </div>
  );
}