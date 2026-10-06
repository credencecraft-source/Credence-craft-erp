import Link from "next/link";
import { ArrowRight, Layers3, UsersRound } from "lucide-react";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const pricingOptions = [
  {
    title: "User Pricing",
    description: "Manage pricing based on the number of users.",
    href: "/platform/plan/dashboard/user%20pricing",
    Icon: UsersRound,
  },
  {
    title: "Module Pricing",
    description: "Manage pricing based on enabled modules.",
    href: "/platform/plan/dashboard/module%20pricing",
    Icon: Layers3,
  },
];

export default function PlatformPlanDashboardPage() {
  return (
    <Page as="div" className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform / Plan</p>
          <h1 className="text-2xl font-bold text-slate-900">Plan Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Choose a pricing model to continue.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {pricingOptions.map(({ title, description, href, Icon }) => (
            <Link
              key={title}
              href={href}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
            >
              <Card className="flex h-full items-center justify-between gap-4 transition-colors group-hover:border-[var(--erp-brand)] group-focus-visible:border-[var(--erp-brand)]">
                <div className="flex min-w-0 items-center gap-4">
                  <Icon className="h-6 w-6 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    <p className="mt-1 text-sm text-slate-600">{description}</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}
