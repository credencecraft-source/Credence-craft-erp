import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function PageRoute({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const cards = [
    {
      key: "returnable-dc-grn",
      label: "Inward",
      title: "Returnable DC GRN",
      description: "Open the returnable DC goods receipt workflow.",
      href: `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/returnable-dc-grn/report`,
      accent: "emerald",
    },
    {
      key: "verification",
      label: "Verification",
      title: "Verification",
      description: "Review and validate incoming returnable DC batches.",
      href: `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/returnable-dc-grn/verification`,
      accent: "amber",
    },
    {
      key: "allocation",
      label: "Allocation",
      title: "Allocation",
      description: "Allocate accepted returnable DC material to downstream needs.",
      href: `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/returnable-dc-grn/allocation`,
      accent: "sky",
    },
  ];

  return (
    <Page as="div">
      <Section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const accentClasses = card.accent === "amber" ? "border-amber-200 hover:border-amber-400" : card.accent === "sky" ? "border-sky-200 hover:border-sky-400" : "border-emerald-200 hover:border-emerald-400";
            const textClasses = card.accent === "amber" ? "text-amber-700" : card.accent === "sky" ? "text-sky-700" : "text-emerald-700";

            return (
              <Link key={card.key} href={card.href} className="block">
                <Card className={`transition hover:shadow-md ${accentClasses}`}>
                  <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${textClasses}`}>{card.label}</p>
                  <h1 className="mt-3 text-2xl font-bold text-slate-900">{card.title}</h1>
                  <p className="mt-2 text-sm text-slate-600">{card.description}</p>
                  <span className={`mt-6 inline-block text-sm font-semibold ${textClasses}`}>Open -&gt;</span>
                </Card>
              </Link>
            );
          })}
        </div>
      </Section>
    </Page>
  );
}