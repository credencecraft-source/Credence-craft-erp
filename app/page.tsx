import { headers } from "next/headers";
import { redirect } from "next/navigation";

import PosOnlineStorefront from "@/components/public/pos-online-storefront";
import {
  findPublishedOnlineStoreByHostname,
  getOrganizationOnlineStorePresentation,
} from "@/lib/services/pos/public-online-store-service";
import LoginPage from "./login-page";

export default async function HomePage() {
  const requestHeaders = await headers();
  const hostname = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(",")[0]
    .trim()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  const customDomainStore = hostname
    ? await findPublishedOnlineStoreByHostname(hostname)
    : null;

  if (!customDomainStore) return <LoginPage />;
  if (hostname !== customDomainStore.primaryHostname) {
    redirect(`https://${customDomainStore.primaryHostname}`);
  }

  const presentation = await getOrganizationOnlineStorePresentation(customDomainStore.id);
  return (
    <PosOnlineStorefront
      storeKey={customDomainStore.publicKey}
      storeName={customDomainStore.organization_name}
      presentation={presentation}
      view="store"
      basePath="/"
    />
  );
}
