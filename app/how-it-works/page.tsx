import PublicHeader from "@/components/public/public-header";
import ModuleTabs from "./how-it-works-module-tabs";
import { groupHowItWorksModulesByTag } from "./modulesData";
import { getPublicHowItWorksCatalog } from "@/lib/services/platform/public-how-it-works-catalog-service";

export const metadata = {
  title: "How Credence Craft Works | Credence Craft",
  description: "See how Credence Craft connects every apparel and manufacturing decision in one ERP workspace.",
};

export default async function HowItWorksPage({
  searchParams,
}: {
  searchParams: Promise<{ versionId?: string | string[] }>;
}) {
  const { versionId: versionIdParam } = await searchParams;
  const versionId = typeof versionIdParam === "string" ? versionIdParam : undefined;
  const catalog = await getPublicHowItWorksCatalog(versionId);
  const groups = groupHowItWorksModulesByTag(catalog?.businessTypes ?? []);

  return (
    <main className="min-h-screen bg-[#f3f6f1] text-[#183b2c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <PublicHeader active="how-it-works" />
        <section id="business-modules" className="py-4 sm:py-6" aria-label="Garment ERP business modules">
          {catalog ? (
            <ModuleTabs groups={groups} />
          ) : (
            <p role="status" className="rounded-2xl border border-[#d9e3dc] bg-white p-6 text-[13px] leading-6 text-[#587066]">
              No active version is available to display its audience tags and business types.
            </p>
          )}
        </section>

      </div>
    </main>
  );
}