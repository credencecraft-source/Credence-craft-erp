"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Database,
  Package,
  Users,
  CreditCard,
  Layers3,
  ChevronDown,
} from "lucide-react";
import Sidebar from "@/components/ui/Sidebar";

const NAV_SECTIONS = [
  {
    title: "Clients",
    icon: Users,
    items: [
      { label: "Clients", href: "/platform/clients", icon: Building2 },
      { label: "Subscriptions", href: "/platform/subscriptions", icon: CreditCard },
    ],
  },
  {
    title: "Databases",
    icon: Database,
    items: [
      { label: "Databases", href: "/platform/databases", icon: Database },
    ],
  },
  {
    title: "Plans",
    icon: Layers3,
    items: [
      { label: "Business Types", href: "/platform/business-types", icon: Building2 },
      { label: "Plans", href: "/platform/plans", icon: Package },
    ],
  },
] as const;

export default function PlatformRootLayoutClient() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <Sidebar className="group">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Building2 size={18} />
        </div>

        <div className="hidden group-data-[expanded=true]:block">
          <h2 className="text-sm font-bold text-slate-800">Platform</h2>
          <p className="text-xs text-slate-500">Administration</p>
        </div>
      </div>

      <nav className="space-y-2">
        {NAV_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          const isOpen = !!openSections[section.title];

          return (
            <div key={section.title} className="space-y-1">
              <button
                onClick={() => toggleSection(section.title)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-slate-700 transition-all hover:bg-slate-100 hover:text-slate-900"
              >
                <div className="flex items-center gap-2">
                  <SectionIcon size={15} className="text-slate-500" />
                  <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-data-[expanded=true]:block">
                    {section.title}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  className={`hidden text-slate-400 transition-transform duration-200 group-data-[expanded=true]:block ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen && (
                <div className="space-y-1 pl-2 group-data-[expanded=true]:pl-4">
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 hover:text-slate-900"
                      >
                        <ItemIcon size={18} className="shrink-0 text-slate-500" />
                        <span className="hidden whitespace-nowrap group-data-[expanded=true]:block">
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </Sidebar>
  );
}