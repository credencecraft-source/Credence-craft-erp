import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";

export default async function WorkspaceRedirectPage() {
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  redirect(`/dashboard/${user.workspace_id}/home`);
}
