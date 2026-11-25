import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import AiControlPanelPage from "./_page-content/ai-control-panel-page";

export default async function AiControlPanelRoute() {
  const admin = await requirePlatformSessionAdmin();
  if (admin.role !== "SUPER_ADMIN" && admin.team_role !== "CTO") {
    redirect("/platform/business-types");
  }
  return <AiControlPanelPage />;
}
