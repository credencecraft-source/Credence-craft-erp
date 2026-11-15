import Link from "next/link";
import { ArrowLeft, CircleDot, Leaf, Recycle, Scissors } from "lucide-react";

import PublicHeader from "@/components/public/public-header";

export const metadata = {
  title: "About | Credence Craft",
  description: "Credence Craft helps fashion teams make better decisions with less waste.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f3f6f1] text-[#183b2c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <PublicHeader active="about" />
        <section className="grid min-h-[calc(100vh-73px)] items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#6d8c46]">Our point of view</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-6xl">Fashion moves forward when every thread is accounted for.</h1>
            <p className="mt-6 max-w-lg text-[14px] leading-7 text-[#587066]">Credence Craft brings the people, materials, orders and decisions behind apparel into one calm, connected workspace. That clarity helps teams make beautiful products with fewer surprises and less waste.</p>
            <Link href="/#sign-in" className="mt-8 inline-flex items-center gap-2 text-[12px] font-semibold text-[#183b2c] underline decoration-[#a7c65a] decoration-2 underline-offset-4"><ArrowLeft size={14} /> Explore the workspace</Link>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] bg-[#183b2c] p-7 text-[#f3f6f1] sm:p-10">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-[#d8ef72]/20" />
            <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full border border-[#d8ef72]/20" />
            <p className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d8ef72]">Designed around the material</p>
            <div className="relative mt-12 space-y-7">
              {[[Leaf, "Make impact visible"], [Scissors, "Respect the craft"], [Recycle, "Keep value in motion"]].map(([Icon, label]) => {
                const FeatureIcon = Icon as typeof Leaf;
                return <div key={label as string} className="flex items-center gap-4 border-b border-white/10 pb-5"><FeatureIcon size={18} className="text-[#d8ef72]" /><span className="text-[15px] font-medium">{label as string}</span></div>;
              })}
            </div>
            <CircleDot className="relative mt-12 text-[#d8ef72]" size={24} />
          </div>
        </section>
      </div>
    </main>
  );
}