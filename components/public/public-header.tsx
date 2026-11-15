"use client";

import Link from "next/link";
import { ArrowUpRight, Leaf, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";


export default function PublicHeader({
  active,
  onImpactClick,
}: {
  active?: "about" | "terms" | "how-it-works" | "impact";
  onImpactClick?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--erp-border)] py-4">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Credence Craft home">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--erp-brand)] text-[var(--erp-brand-soft)]">
          <Leaf size={15} strokeWidth={2.2} />
        </span>
        <span className="text-[0.8125rem] font-semibold tracking-[-0.02em] text-[var(--erp-text)]">Credence Craft</span>
      </Link>
      <nav className="flex items-center gap-2 text-[0.6875rem] font-medium text-[var(--erp-muted)] sm:gap-3 lg:gap-5" aria-label="Public navigation">
        {onImpactClick ? (
          <Button
            type="button"
            onClick={onImpactClick}
            className={active === "impact" ? "hidden items-center gap-1.5 font-semibold text-[var(--erp-text)] sm:inline-flex" : "hidden items-center gap-1.5 transition-colors hover:text-[var(--erp-text)] sm:inline-flex"}
          >
            <Sparkles size={12} className="text-[var(--erp-brand)]" />
            <span>Impact</span>
          </Button>
        ) : (
          <Link href="/#impact" className={active === "impact" ? "hidden items-center gap-1.5 text-[var(--erp-text)] sm:inline-flex" : "hidden items-center gap-1.5 transition-colors hover:text-[var(--erp-text)] sm:inline-flex"}>
            <Sparkles size={12} className="text-[var(--erp-brand)]" />
            <span>Impact</span>
          </Link>
        )}
        <Link href="/about" className={active === "about" ? "hidden text-[var(--erp-text)] lg:inline-flex" : "hidden transition-colors hover:text-[var(--erp-text)] lg:inline-flex"}>About us</Link>
        <Link href="/how-it-works" className={active === "how-it-works" ? "hidden text-[var(--erp-text)] lg:inline-flex" : "hidden transition-colors hover:text-[var(--erp-text)] lg:inline-flex"}>How it works</Link>
        <Link href="/terms" className={active === "terms" ? "hidden text-[var(--erp-text)] lg:inline-flex" : "hidden transition-colors hover:text-[var(--erp-text)] lg:inline-flex"}>Terms</Link>
        <Link href="/#sign-in" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--erp-brand)] px-3 py-2 text-[0.6875rem] font-semibold text-white transition-colors hover:bg-[var(--erp-brand-hover)]">
          <span>Sign in</span>
          <ArrowUpRight size={12} />
        </Link>
      </nav>
    </header>
  );
}