import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import PosOnlineStorefront from "@/components/public/pos-online-storefront";
import {
  findPublishedOnlineStoreByHostname,
  getOrganizationOnlineStorePresentation,
} from "@/lib/services/pos/public-online-store-service";

export default async function CustomDomainStoreCartPage() {
  const requestHeaders = await headers();
  const hostname = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(",")[0]
    .trim()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  const store = hostname ? await findPublishedOnlineStoreByHostname(hostname) : null;
  if (!store) notFound();
  if (hostname !== store.primaryHostname) redirect(`https://${store.primaryHostname}/cart`);

  const presentation = await getOrganizationOnlineStorePresentation(store.id);
  return (
    <PosOnlineStorefront
      storeKey={store.publicKey}
      storeName={store.organization_name}
      presentation={presentation}
      view="cart"
      basePath="/"
    />
  );
}
