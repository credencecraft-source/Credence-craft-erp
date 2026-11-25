import { headers } from "next/headers";
import { redirect } from "next/navigation";

import PosOnlineStorefront from "@/components/public/pos-online-storefront";
import {
  findPublishedOnlineStoreByHostname,
  getOrganizationOnlineStorePresentation,
} from "@/lib/services/pos/public-online-store-service";
import HomeLandingPage from "./_page-content/home-landing-page";

const marketingHostnames = new Set(["credencecraft.in", "www.credencecraft.in"]);

export const metadata = {
  title: "Credence Craft | Apparel ERP for Manufacturing, Retail & Distribution",
  description:
    "Connect apparel merchandising, sourcing, production, inventory, distribution and retail in one organization-scoped ERP workspace.",
};

export default function HomePage() {
  if (process.env.NODE_ENV !== "production") return <HomeLandingPage />;
  return getProductionHomePage();
}

async function getProductionHomePage() {
  const requestHeaders = await headers();
  const hostname = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(",")[0]
    .trim()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  const customDomainStore = hostname && !marketingHostnames.has(hostname)
    ? await findPublishedOnlineStoreByHostname(hostname)
    : null;

  if (!customDomainStore) return <HomeLandingPage />;
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
