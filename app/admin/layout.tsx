import type { ReactNode } from "react";

import PlatformLayout from "@/app/platform/layout";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PlatformLayout>{children}</PlatformLayout>;
}
