import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";

export default async function WorkspaceUsageSettingsAlias() {
  const user = await requireSessionUser();
  redirect(`/dashboard/${user.workspace_id}/configuration/server-cost`);
}
