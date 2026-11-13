import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import WorkspaceServerCostPage from "./_page-content/workspace-server-cost-page";

export default async function WorkspaceServerCostRoute({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();

  return <WorkspaceServerCostPage workspaceId={workspaceId} />;
}
