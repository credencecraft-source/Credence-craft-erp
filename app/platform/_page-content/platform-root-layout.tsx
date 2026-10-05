"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronDown,
} from "lucide-react";
import Sidebar from "@/components/ui/Sidebar";
import Button from "@/components/ui/Button";


const NAV_SECTIONS = [
  {
    title: "Organisations",
    items: [
      { label: "Organisations", href: "/platform/organisations" },
      { label: "Subscriptions", href: "/platform/subscriptions" },
    ],
  },
  {
    title: "Leads",
    items: [
      { label: "Leads", href: "/platform/leads" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Workspace Users", href: "/platform/workspace-users" },
    ],
  },
  {
    title: "Databases",
    items: [
      { label: "Databases", href: "/platform/databases" },
    ],
  },
  {
    title: "Plans",
    items: [
      { label: "Business Types", href: "/platform/business-types" },
      { label: "Segments", href: "/platform/segments" },
      { label: "Versions", href: "/platform/versions" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Support Tickets", href: "/platform/support-tickets" },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Email and OTP", href: "/platform/settings/email" },
      {
        label: "Mobile OTP (MSG91)",
        href: "/platform/settings/mobile-otp",
      },
      { label: "Platform access", href: "/platform/settings/access" },
    ],
  },
] as const;

export default function PlatformRootLayoutClient({
  accessLabel,
  isSuperAdminView,
  canManageAccounts,
  canAccessConfiguration,
  canAccessLeads,
  attentionCounts,
}: {
  accessLabel: string;
  isSuperAdminView: boolean;
  canManageAccounts: boolean;
  canAccessConfiguration: boolean;
  canAccessLeads: boolean;
  attentionCounts: {
    openTickets: number;
    pendingOrganizations: number;
    pendingSubscriptions: number;
    total: number;
  };
}) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string, isOpen: boolean) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !isOpen,
    }));
  };

  const visibleSections = NAV_SECTIONS.filter((section) => {
    if (section.title === "Leads") {
      return canAccessLeads;
    }

    return (
      (!isSuperAdminView || !["Databases", "Plans", "Support"].includes(section.title)) &&
      (isSuperAdminView && section.title === "Settings"
        ? true
        : canAccessConfiguration ||
          !["Databases", "Plans", "Settings"].includes(section.title))
    );
  });

  return (
    <Sidebar className="group erp-platform-shell border-slate-800 bg-slate-950 text-slate-200 shadow-none">
      <div className="-mx-4 -mt-4 mb-3 flex items-center gap-2.5 border-b border-slate-800 p-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Building2 size={16} aria-hidden="true" />
        </div>

        <div className="hidden group-data-[expanded=true]:block">
          <h2 className="text-[1.125rem] font-semibold text-white">Platform</h2>
          <p className="text-[0.625rem] text-slate-400">{accessLabel}</p>
        </div>
      </div>

      <nav className="-mx-2 space-y-1">
        {visibleSections.map((section) => {
          const items = section.items
            .filter((item) => item.href !== "/platform/settings/access" || canManageAccounts)
            .filter((item) => !isSuperAdminView || section.title !== "Settings" || item.href === "/platform/settings/access");
          const isCurrentSection = items.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
          const isOpen = openSections[section.title] ?? isCurrentSection;

          return (
            <div key={section.title} className="space-y-1">
              <Button
                onClick={() => toggleSection(section.title, isOpen)}
                variant="ghost"
                aria-expanded={isOpen}
                className={`flex w-full items-center justify-between rounded-md border-l-2 px-2 py-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${
                  isCurrentSection
                    ? "border-emerald-500 font-bold text-white"
                    : "border-transparent"
                }`}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      isCurrentSection ? "bg-emerald-400" : "bg-slate-500"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden text-[0.875rem] font-medium text-slate-300 group-data-[expanded=true]:block">
                    {section.title}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  className={`hidden text-slate-400 transition-transform duration-200 group-data-[expanded=true]:block ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>

              {isOpen && (
                <div className="ml-3 space-y-1 border-l border-slate-800 pl-2 group-data-[expanded=true]:ml-4 group-data-[expanded=true]:pl-3">
                  {items.map((item) => {
                    const isCurrentPage = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const attentionCount = item.href === "/platform/support-tickets"
                      ? attentionCounts.openTickets
                      : item.href === "/platform/organisations"
                        ? attentionCounts.pendingOrganizations
                        : item.href === "/platform/subscriptions"
                          ? attentionCounts.pendingSubscriptions
                          : 0;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isCurrentPage ? "page" : undefined}
                        className={`flex items-center gap-3 border-l-2 px-2 py-2 text-[0.8125rem] font-normal transition-colors ${
                          isCurrentPage
                            ? "-ml-px rounded-md border-emerald-600 bg-emerald-600 font-medium text-white"
                            : "border-transparent text-slate-200 hover:rounded-md hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            isCurrentPage ? "bg-white" : "bg-slate-500"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="hidden whitespace-nowrap group-data-[expanded=true]:block">
                          {item.label}
                        </span>
                        {attentionCount > 0 && <span aria-label={`${attentionCount} items need attention`} className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-950">{attentionCount}</span>}
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