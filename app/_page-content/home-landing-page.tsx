import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  Boxes,
  Check,
  Factory,
  Layers3,
  PackageCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";

import PublicHeader from "@/components/public/public-header";

const workflowSteps = [
  {
    icon: Layers3,
    title: "Plan the range",
    description: "Bring buyer requirements, styles, quantities and delivery dates into view.",
  },
  {
    icon: Boxes,
    title: "Source with context",
    description: "Connect material needs, purchasing and incoming goods to the orders they support.",
  },
  {
    icon: Factory,
    title: "Make with visibility",
    description: "Follow production, quality checks and finished goods through the factory flow.",
  },
  {
    icon: Truck,
    title: "Move and sell",
    description: "Coordinate dispatch, distribution, retail and stock-aware sales from a connected record.",
  },
];

const operatingPrinciples = [
  "One shared view across teams",
  "Traceable orders and materials",
  "Clear handoffs from factory to channel",
];

const services = [
  {
    title: "Custom apparel ERP development",
    promise: "Your ERP. Your process.",
    detail: "Custom workflows for the way your apparel business plans, buys, makes and sells.",
  },
  {
    title: "Apparel ERP audit",
    promise: "Find the gaps before they become habits.",
    detail: "Review configuration, data handoffs, reporting and day-to-day controls.",
  },
  {
    title: "SOPs and industry benchmarks",
    promise: "Make good practice repeatable.",
    detail: "Create apparel-specific procedures and practical benchmarks for the work.",
  },
  {
    title: "Employee training",
    promise: "Train the team behind the system.",
    detail: "Hands-on learning shaped around real roles, tasks and apparel workflows.",
  },
  {
    title: "System building and monitoring",
    promise: "Built with care. Kept in view.",
    detail: "Plan, configure and monitor ERP systems with clear ownership and follow-up.",
  },
  {
    title: "ERP-based SOP implementation",
    promise: "Put the SOP where the work happens.",
    detail: "Translate approved procedures into practical ERP steps, checks and handoffs.",
  },
  {
    title: "Job-profile-based ERP actions",
    promise: "The right action for every role.",
    detail: "Align responsibilities and system actions with approved job profiles.",
  },
  {
    title: "Internal and external audit support",
    promise: "Be ready before the review begins.",
    detail: "Prepare records, teams and follow-up actions for internal and external audits.",
  },
  {
    title: "Apparel-specific audits",
    promise: "Audits that understand the garment journey.",
    detail: "Review controls across product, material, factory and fulfilment workflows.",
  },
  {
    title: "Safety, sustainability and standards readiness",
    promise: "Standards in view. Evidence in order.",
    detail: "Readiness and corrective-action support for apparel safety and sustainability, including ZDHC chemical programmes, GOTS and SA8000 requirements.",
  },
];

export default function HomeLandingPage() {
  return (
    <main className="min-h-dvh bg-[var(--erp-bg)] text-[var(--erp-text)]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <PublicHeader active="home" />

        <section className="grid items-center gap-10 py-12 sm:py-16 lg:min-h-[calc(100dvh-73px)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--erp-brand)]">
              <span className="h-2 w-2 rounded-full bg-[var(--erp-brand)]" />
              Apparel ERP for the whole value chain
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.04] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
              From the first order to the{" "}
              <span className="text-[var(--erp-brand)]">final delivery.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[var(--erp-muted)] sm:text-lg sm:leading-8">
              Credence Craft connects the work behind apparel—merchandising,
              materials, manufacturing, distribution and retail—in one clear,
              organization-scoped ERP workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/how-it-works"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--erp-brand)] bg-[var(--erp-brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--erp-brand-hover)]"
              >
                Explore how it works <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--erp-text)] shadow-sm transition-colors hover:bg-[var(--erp-surface-soft)]"
              >
                Sign in
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-[var(--erp-border)] pt-5 text-sm text-[var(--erp-muted)]">
              <span className="inline-flex items-center gap-2">
                <Check size={15} className="text-[var(--erp-brand)]" aria-hidden="true" />
                Manufacturing
              </span>
              <span className="inline-flex items-center gap-2">
                <Check size={15} className="text-[var(--erp-brand)]" aria-hidden="true" />
                Distribution
              </span>
              <span className="inline-flex items-center gap-2">
                <Check size={15} className="text-[var(--erp-brand)]" aria-hidden="true" />
                Retail
              </span>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-3xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)] sm:p-7"
            aria-label="Illustration of connected apparel operations"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted)]">
                  One connected workflow
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  See the whole order
                </h2>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                <PackageCheck size={19} aria-hidden="true" />
              </span>
            </div>

            <div className="mt-7 space-y-3">
              {[
                { label: "Buyer order", detail: "Style, quantity and delivery plan", icon: ShoppingBag },
                { label: "Materials & production", detail: "Purchasing, factory and quality flow", icon: Factory },
                { label: "Dispatch & sales", detail: "Distribution, retail and stock movement", icon: Truck },
              ].map(({ label, detail, icon: Icon }, index) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 sm:gap-4 sm:p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--erp-surface)] text-[var(--erp-brand)]">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--erp-muted)]">{detail}</p>
                  </div>
                  <span className="hidden text-xs font-medium text-[var(--erp-muted)] sm:inline">
                    {index === 0 ? "Plan" : index === 1 ? "Make" : "Move"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--erp-muted)]">
              A simple illustration of how teams and records can stay connected.
            </p>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-8 py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="erp-eyebrow">One apparel operation</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
              Less chasing across teams. More clarity at every handoff.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--erp-muted)] sm:text-base">
              Keep the details that matter close to the work—from a buyer’s
              requirement and material plan to factory progress and stock at the
              point of sale.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map(({ icon: Icon, title, description }, index) => (
              <article key={title} className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)]">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold text-[var(--erp-muted)]">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">{description}</p>
              </article>
            ))}
          </div>
          <Link
            href="/how-it-works"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] underline decoration-[var(--erp-brand)] underline-offset-4"
          >
            Browse the workflows <ArrowDownRight size={16} aria-hidden="true" />
          </Link>
        </section>

        <section id="services" className="scroll-mt-8 py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="erp-eyebrow">Beyond the software</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
              Build the system. Build the way of working.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--erp-muted)] sm:text-base">
              From a custom ERP and practical SOPs to training, monitoring and
              audit readiness, get support for the people and processes behind
              apparel operations.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(({ title, promise, detail }, index) => (
              <article
                key={title}
                className={`rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)] ${index === services.length - 1 ? "lg:col-start-2" : ""}`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted)]">
                  Service {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-4 text-base font-semibold leading-6">{title}</h3>
                <p className="mt-2 text-sm font-semibold text-[var(--erp-brand)]">{promise}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--erp-muted)]">{detail}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 max-w-4xl text-xs leading-5 text-[var(--erp-muted)]">
            Standards support focuses on readiness, evidence and corrective
            actions. Certification and independent verification decisions
            remain with the applicable authorized bodies.
          </p>
        </section>

        <section id="impact" className="grid scroll-mt-8 gap-8 rounded-3xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-6 shadow-[var(--erp-shadow)] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="erp-eyebrow">Built around better decisions</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em]">
              Respect the craft. Understand the flow.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--erp-muted)]">
              Apparel is made by people, materials and many connected choices.
              A clearer operating picture helps teams spot what needs attention
              and keep valuable work moving.
            </p>
          </div>
          <ul className="space-y-3">
            {operatingPrinciples.map((principle) => (
              <li key={principle} className="flex items-center gap-3 rounded-xl bg-[var(--erp-surface-soft)] px-4 py-3 text-sm font-medium">
                <Check size={16} className="shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
                {principle}
              </li>
            ))}
          </ul>
        </section>

        <section id="zoho-apparel-erp" className="grid scroll-mt-8 gap-8 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="erp-eyebrow">Official Zoho Partner</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
              Zoho Apparel ERP, shaped around how your business works.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--erp-muted)] sm:text-base">
              Pair apparel-specific operations with the Zoho tools your team
              uses. Credence Craft helps connect manufacturing, distribution
              and retail workflows with Zoho Books finance processes, so teams
              can work from a more consistent business picture.
            </p>
            <Link
              href="/how-it-works"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] underline decoration-[var(--erp-brand)] underline-offset-4"
            >
              Explore the connected workflows <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted)]">
              Designed for apparel teams
            </p>
            <div className="mt-5 space-y-4">
              {[
                ["Apparel operations", "Orders, materials, factory and stock"],
                ["Business channels", "Distribution, retail and fulfilment"],
                ["Zoho Books", "Connected finance workflows"],
              ].map(([title, detail]) => (
                <div key={title} className="border-b border-[var(--erp-border)] pb-4 last:border-b-0 last:pb-0">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--erp-muted)]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-10 flex flex-col gap-5 rounded-3xl bg-[var(--erp-brand)] p-6 text-white sm:mb-14 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-brand-soft)]">
              Take a closer look
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              See how your apparel workflows can connect.
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/80">
              Explore the product flows, then sign in to your Credence Craft workspace.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/how-it-works"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/30 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--erp-brand)] transition-colors hover:bg-[var(--erp-brand-soft)]"
            >
              How it works <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/40 bg-transparent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section id="terms" className="mb-10 scroll-mt-8 rounded-3xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-6 shadow-[var(--erp-shadow)] sm:mb-14 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="erp-eyebrow">The clear version</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Terms and conditions</h2>
            </div>
            <p className="text-xs text-[var(--erp-muted)]">Last updated September 20, 2026</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ["Using Credence Craft", "Credence Craft is a workspace for authorized fashion and manufacturing teams. By using the service, you agree to provide accurate account information, keep your access details private, and use the workspace only for lawful business operations."],
              ["Your data and responsibility", "Your organization remains responsible for the accuracy, permissions and lawful use of the information entered into the service. You should give access only to people who need it and review permissions as your team changes."],
              ["Service use", "Do not reverse engineer, misuse, disrupt, or attempt unauthorized access to the service. We may update features to improve security and reliability, and we will communicate material changes through appropriate channels."],
              ["Questions", "For questions about these terms or your workspace, please contact the Credence Craft support team through your account."],
            ].map(([title, detail]) => (
              <article key={title} className="rounded-2xl bg-[var(--erp-surface-soft)] p-5">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--erp-border)] py-6 text-xs text-[var(--erp-muted)]">
          <p>Credence Craft · Apparel operations, connected.</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer navigation">
            <Link href="#impact" className="hover:text-[var(--erp-text)]">About</Link>
            <Link href="/how-it-works" className="hover:text-[var(--erp-text)]">How it works</Link>
            <Link href="#terms" className="hover:text-[var(--erp-text)]">Terms</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
