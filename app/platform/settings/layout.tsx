import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";

export default async function PlatformSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requirePlatformSessionAdmin();
  if (admin.team_role) {
    redirect("/platform/organisations");
  }
  return children;
}
