import { notFound } from "next/navigation";

import PosOnlineStorefront from "@/components/public/pos-online-storefront";
import {
  findPublishedOnlineStore,
  getOrganizationOnlineStorePresentation,
} from "@/lib/services/pos/public-online-store-service";

export default async function PublicOnlineStoreCartPage({
  params,
}: {
  params: Promise<{ storeKey: string }>;
}) {
  const { storeKey } = await params;
  const store = await findPublishedOnlineStore(storeKey);
  if (!store) notFound();
  const presentation = await getOrganizationOnlineStorePresentation(store.id);

  return (
    <PosOnlineStorefront
      storeKey={storeKey}
      storeName={store.organization_name}
      presentation={presentation}
      view="cart"
    />
  );
}
