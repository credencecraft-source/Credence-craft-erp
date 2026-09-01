import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSessionUser } from "@/lib/auth/session-manager";

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default async function DashboardRootLayout({
  children,
}: DashboardRootLayoutProps) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return <>{children}</>;
}
