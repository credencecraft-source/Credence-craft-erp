import type { ReactNode } from "react";
import { requirePlatformConfigurationAccess } from "@/lib/auth/platform-session-manager";

export default async function PlatformVersionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePlatformConfigurationAccess();
  return children;
}
