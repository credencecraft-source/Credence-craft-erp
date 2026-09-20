"use client";

import Link from "next/link";
import { Leaf } from "lucide-react";

export default function PublicHeader({
  active,
  onImpactClick,
}: {
  active?: "about" | "terms" | "how-it-works" | "impact";
  onImpactClick?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[#d9e3dc] py-4">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Credence Craft home">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#183b2c] text-[#d8ef72]"><Leaf size={15} strokeWidth={2.2} /></span>
        <span className="text-[13px] font-semibold tracking-[-0.02em] text-[#183b2c]">Credence Craft</span>
      </Link>
      <nav className="flex items-center gap-3 text-[11px] font-medium text-[#587066] sm:gap-5" aria-label="Public navigation">
        {onImpactClick ? (
          <button type="button" onClick={onImpactClick} className={active === "impact" ? "font-semibold text-[#183b2c]" : "transition-colors hover:text-[#183b2c]"}>Impact</button>
        ) : (
          <Link href="/#impact" className={active === "impact" ? "text-[#183b2c]" : "transition-colors hover:text-[#183b2c]"}>Impact</Link>
        )}
        <Link href="/about" className={active === "about" ? "text-[#183b2c]" : "transition-colors hover:text-[#183b2c]"}>About us</Link>
        <Link href="/how-it-works" className={active === "how-it-works" ? "text-[#183b2c]" : "transition-colors hover:text-[#183b2c]"}>How it works</Link>
        <Link href="/terms" className={active === "terms" ? "text-[#183b2c]" : "transition-colors hover:text-[#183b2c]"}>Terms</Link>
        <Link href="/#sign-in" className="rounded-full bg-[#183b2c] px-3.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#245640]">Sign in</Link>
      </nav>
    </header>
  );
}