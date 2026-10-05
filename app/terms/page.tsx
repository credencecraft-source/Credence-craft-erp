import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import PublicHeader from "@/components/public/public-header";

export const metadata = {
  title: "Terms and Conditions | Credence Craft",
  description: "Terms and conditions for using Credence Craft.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <PublicHeader active="terms" />
        <section className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl py-16 sm:py-24">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.15em] text-[var(--erp-brand)]">The clear version</p>
          <h1 className="mt-4 text-[1.5rem] font-bold tracking-[-0.03em] sm:text-[2rem]">Terms and conditions</h1>
          <p className="mt-4 text-[0.75rem] text-[var(--erp-muted)]">Last updated September 20, 2026</p>
          <div className="mt-12 space-y-9 text-[0.875rem] leading-7 text-[var(--erp-muted)]">
            <section>
              <h2 className="text-[0.9375rem] font-semibold text-[var(--erp-text)]">Using Credence Craft</h2>
              <p className="mt-2">Credence Craft is a workspace for authorized fashion and manufacturing teams. By using the service, you agree to provide accurate account information, keep your access details private, and use the workspace only for lawful business operations.</p>
            </section>
            <section>
              <h2 className="text-[0.9375rem] font-semibold text-[var(--erp-text)]">Your data and responsibility</h2>
              <p className="mt-2">Your organization remains responsible for the accuracy, permissions and lawful use of the information entered into the service. You should give access only to people who need it and review permissions as your team changes.</p>
            </section>
            <section>
              <h2 className="text-[0.9375rem] font-semibold text-[var(--erp-text)]">Service use</h2>
              <p className="mt-2">Do not reverse engineer, misuse, disrupt, or attempt unauthorized access to the service. We may update features to improve security and reliability, and we will communicate material changes through appropriate channels.</p>
            </section>
            <section>
              <h2 className="text-[0.9375rem] font-semibold text-[var(--erp-text)]">Questions</h2>
              <p className="mt-2">For questions about these terms or your workspace, please contact the Credence Craft support team through your account.</p>
            </section>
          </div>
          <Link href="/" className="mt-12 inline-flex items-center gap-2 text-[0.75rem] font-semibold text-[var(--erp-text)] underline decoration-[var(--erp-brand)] decoration-2 underline-offset-4">
            <ArrowLeft size={14} /> Back to Credence Craft
          </Link>
        </section>
      </div>
    </main>
  );
}