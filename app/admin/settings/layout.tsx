import type { ReactNode } from "react";

import PlatformSettingsLayout from "@/app/platform/settings/layout";

export default function AdminSettingsLayout({ children }: { children: ReactNode }) {
  return <PlatformSettingsLayout>{children}</PlatformSettingsLayout>;
}
