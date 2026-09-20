import Link from "next/link";
import { ArrowRight } from "lucide-react";

import PublicHeader from "@/components/public/public-header";
import ModuleTabs from "./how-it-works-module-tabs";

export const metadata = {
  title: "How Credence Craft Works | Credence Craft",
  description: "See how Credence Craft connects every apparel and manufacturing decision in one ERP workspace.",
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-[#f3f6f1] text-[#183b2c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <PublicHeader active="how-it-works" />
        <nav className="border-b border-[#d9e3dc] py-3" aria-label="How it works sections">
          <Link href="#order-management" className="inline-flex border-b-2 border-[#183b2c] px-2 pb-2 text-[11px] font-semibold text-[#183b2c]">Order Management</Link>
        </nav>
        <section id="order-management" className="py-14 sm:py-20">
          <ModuleTabs />
        </section>

        <section className="mb-16 grid gap-8 rounded-[1.75rem] bg-[#e8f0df] p-7 sm:mb-24 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6d8c46]">The result for an organization</p><h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Control is not more paperwork. It is knowing what needs attention while there is still time to act.</h2><p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#587066]">With connected records and clear ownership, teams can reduce overbuying, avoid preventable rework, see bottlenecks, plan growth from real capacity, and make efficiency measurable across the whole production cycle.</p></div>
          <Link href="/#sign-in" className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#183b2c] underline decoration-[#a7c65a] decoration-2 underline-offset-4">Explore the workspace <ArrowRight size={14} /></Link>
        </section>
      </div>
    </main>
  );
}