import type { ReactNode } from "react";
import { requirePlatformConfigurationAccess } from "@/lib/auth/platform-session-manager";

export default async function PlatformSegmentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePlatformConfigurationAccess();
  return children;
}
