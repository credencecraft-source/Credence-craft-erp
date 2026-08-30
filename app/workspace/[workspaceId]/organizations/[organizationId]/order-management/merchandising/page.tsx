import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";

export default async function MerchandisingPage({
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Choose a merchandising module from the tabs above to switch between Orders, Order Summary, Samples, and BOM.
      </div>
    </div>
  );
}