import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";

export default async function WorkSpaceDashboard() {
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  redirect(`/workspace/${user.workspace_id}`);
}