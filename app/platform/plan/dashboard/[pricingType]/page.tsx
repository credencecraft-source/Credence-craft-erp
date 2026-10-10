import PlatformPlanPricingPage from "../_page-content/platform-plan-pricing-page";
import PlatformPlanUserPricingPage from "../_page-content/platform-plan-user-pricing-page";

export default async function PlatformPlanPricingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ pricingType: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { pricingType } = await params;
  if (pricingType.replace(/%20/gi, " ").toLowerCase() === "user pricing") {
    return <PlatformPlanUserPricingPage searchParams={searchParams} />;
  }
  return <PlatformPlanPricingPage pricingType={pricingType} />;
}
