import { redirect } from "next/navigation";

import { getPlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import PlatformSupportLogin from "./_page-content/platform-support-login";

export default async function PlatformPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const search = await searchParams;
  const returnTo =
    search?.returnTo === "/platform/control-panel"
      ? search.returnTo
      : undefined;

  if (await getPlatformSessionAdmin()) {
    redirect(returnTo ?? "/platform/organisations");
  }

  return <PlatformSupportLogin returnTo={returnTo} />;
}
