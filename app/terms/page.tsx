import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import PublicHeader from "@/components/public/public-header";

export const metadata = {
  title: "Terms and Conditions | Credence Craft",
  description: "Terms and conditions for using Credence Craft.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f3f6f1] text-[#183b2c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <PublicHeader active="terms" />
        <section className="mx-auto min-h-[calc(100vh-73px)] max-w-3xl py-16 sm:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#6d8c46]">The clear version</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Terms and conditions</h1>
          <p className="mt-4 text-[12px] text-[#789087]">Last updated September 20, 2026</p>
          <div className="mt-12 space-y-9 text-[14px] leading-7 text-[#587066]">
            <section><h2 className="text-[15px] font-semibold text-[#183b2c]">Using Credence Craft</h2><p className="mt-2">Credence Craft is a workspace for authorized fashion and manufacturing teams. By using the service, you agree to provide accurate account information, keep your access details private, and use the workspace only for lawful business operations.</p></section>
            <section><h2 className="text-[15px] font-semibold text-[#183b2c]">Your data and responsibility</h2><p className="mt-2">Your organization remains responsible for the accuracy, permissions and lawful use of the information entered into the service. You should give access only to people who need it and review permissions as your team changes.</p></section>
            <section><h2 className="text-[15px] font-semibold text-[#183b2c]">Service use</h2><p className="mt-2">Do not reverse engineer, misuse, disrupt, or attempt unauthorized access to the service. We may update features to improve security and reliability, and we will communicate material changes through appropriate channels.</p></section>
            <section><h2 className="text-[15px] font-semibold text-[#183b2c]">Questions</h2><p className="mt-2">For questions about these terms or your workspace, please contact the Credence Craft support team through your account.</p></section>
          </div>
          <Link href="/" className="mt-12 inline-flex items-center gap-2 text-[12px] font-semibold text-[#183b2c] underline decoration-[#a7c65a] decoration-2 underline-offset-4"><ArrowLeft size={14} /> Back to Credence Craft</Link>
        </section>
      </div>
    </main>
  );
}