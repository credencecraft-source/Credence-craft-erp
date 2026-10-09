import { redirect } from "next/navigation";

import { getPlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import PlatformSupportLogin from "./_page-content/platform-support-login";

export default async function PlatformPage() {
  if (await getPlatformSessionAdmin()) {
    redirect("/platform/organisations");
  }

  return <PlatformSupportLogin />;
}
