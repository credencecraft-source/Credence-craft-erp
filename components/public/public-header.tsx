"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";


export default function PublicHeader({
  active,
  onImpactClick,
}: {
  active?: "home" | "about" | "terms" | "how-it-works" | "impact";
  onImpactClick?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--erp-border)] py-1">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Credence Craft home">
        <Image
          src="/credence-craft-apparel-erp-logo.png"
          alt="Credence Craft Apparel ERP"
          width={1569}
          height={692}
          sizes="(max-width: 640px) 112px, 128px"
          className="h-auto w-28 object-contain sm:w-32"
        />
      </Link>
      <nav className="flex items-center gap-2 text-[0.6875rem] font-medium text-[var(--erp-muted)] sm:gap-3 lg:gap-5" aria-label="Public navigation">
        {onImpactClick ? (
          <Button
            type="button"
            onClick={onImpactClick}
            className={active === "impact" ? "hidden items-center gap-1.5 font-semibold text-[var(--erp-text)] sm:inline-flex" : "hidden items-center gap-1.5 transition-colors hover:text-[var(--erp-text)] sm:inline-flex"}
          >
            <Sparkles size={12} className="text-[var(--erp-brand)]" />
            <span>{active === "home" ? "About us" : "Impact"}</span>
          </Button>
        ) : (
          <Link href={active === "home" ? "#impact" : "/#impact"} className={active === "impact" ? "hidden items-center gap-1.5 text-[var(--erp-text)] sm:inline-flex" : "hidden items-center gap-1.5 transition-colors hover:text-[var(--erp-text)] sm:inline-flex"}>
            <Sparkles size={12} className="text-[var(--erp-brand)]" />
            <span>{active === "home" ? "About us" : "Impact"}</span>
          </Link>
        )}
        <Link href="/how-it-works" className={active === "how-it-works" ? "hidden text-[var(--erp-text)] lg:inline-flex" : "hidden transition-colors hover:text-[var(--erp-text)] lg:inline-flex"}>How it works</Link>
        <Link href={active === "home" ? "#services" : "/#services"} className="hidden transition-colors hover:text-[var(--erp-text)] lg:inline-flex">Services</Link>
        <Link href={active === "home" ? "#zoho-apparel-erp" : "/#zoho-apparel-erp"} className={active === "home" ? "hidden font-semibold text-[var(--erp-brand)] lg:inline-flex" : "hidden transition-colors hover:text-[var(--erp-text)] lg:inline-flex"}>Zoho Apparel ERP</Link>
        <Link href={active === "home" ? "#terms" : "/#terms"} className="hidden transition-colors hover:text-[var(--erp-text)] lg:inline-flex">Terms</Link>
        <Link href="/sign-in" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--erp-brand)] px-3 py-2 text-[0.6875rem] font-semibold text-white transition-colors hover:bg-[var(--erp-brand-hover)]">
          <span>Sign in</span>
          <ArrowUpRight size={12} />
        </Link>
      </nav>
    </header>
  );
}