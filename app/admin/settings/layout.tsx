import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";

export default async function AdminSettingsLayout({ children }: { children: ReactNode }) {
  const admin = await requirePlatformSessionAdmin();
  if (admin.team_role === "CMO" || admin.team_role === "SALES_MANAGER") {
    redirect("/platform/organisations");
  }
  return children;
}
