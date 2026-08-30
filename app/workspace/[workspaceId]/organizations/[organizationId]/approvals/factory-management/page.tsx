import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

const ITEMS = [
  { name: "Cutting plan approval", status: "Pending" },
  { name: "Production batch approval", status: "Waiting" },
  { name: "Machine allocation approval", status: "Approved" },
] as const;

export default async function ApprovalFactoryManagementPage({
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
        <p >Factory management</p>
        <h3 >Approval queue</h3>
      </div>

      <div >
        {ITEMS.map((item) => (
          <div key={item.name} >
            <p >Request</p>
            <h4 >{item.name}</h4>
            <div >
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.status === "Approved" ? "bg-emerald-100 text-emerald-700" : item.status === "Waiting" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}>
                {item.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}