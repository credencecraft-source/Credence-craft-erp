"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Database,
  Users,
  UserRoundPlus,
  CreditCard,
  Layers3,
  Tags,
  CalendarRange,
  ChevronDown,
  LifeBuoy,
  Mail,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import Sidebar from "@/components/ui/Sidebar";

const NAV_SECTIONS = [
  {
    title: "Organisations",
    icon: Users,
    items: [
      { label: "Organisations", href: "/platform/organisations", icon: Building2 },
      { label: "Subscriptions", href: "/platform/subscriptions", icon: CreditCard },
    ],
  },
  {
    title: "Leads",
    icon: UserRoundPlus,
    items: [
      { label: "Leads", href: "/platform/leads", icon: UserRoundPlus },
    ],
  },
  {
    title: "Workspace",
    icon: Users,
    items: [
      { label: "Workspace Users", href: "/platform/workspace-users", icon: Users },
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
      { label: "Segments", href: "/platform/segments", icon: Tags },
      { label: "Versions", href: "/platform/versions", icon: CalendarRange },
    ],
  },
  {
    title: "Support",
    icon: LifeBuoy,
    items: [
      { label: "Support Tickets", href: "/platform/support-tickets", icon: LifeBuoy },
    ],
  },
  {
    title: "Settings",
    icon: Mail,
    items: [
      { label: "Email and OTP", href: "/platform/settings/email", icon: Mail },
      {
        label: "Mobile OTP (MSG91)",
        href: "/platform/settings/mobile-otp",
        icon: Smartphone,
      },
      { label: "Platform access", href: "/platform/settings/access", icon: ShieldCheck },
    ],
  },
] as const;

export default function PlatformRootLayoutClient({
  accessLabel,
  isSuperAdminView,
  canManageAccounts,
  canAccessConfiguration,
  attentionCounts,
}: {
  accessLabel: string;
  isSuperAdminView: boolean;
  canManageAccounts: boolean;
  canAccessConfiguration: boolean;
  attentionCounts: {
    openTickets: number;
    pendingOrganizations: number;
    pendingSubscriptions: number;
    total: number;
  };
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const visibleSections = NAV_SECTIONS.filter(
    (section) =>
      (!isSuperAdminView || !["Databases", "Plans", "Support"].includes(section.title)) &&
      (isSuperAdminView && section.title === "Settings"
        ? true
        : canAccessConfiguration ||
          !["Databases", "Plans", "Settings"].includes(section.title)),
  );

  return (
    <Sidebar className="group">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Building2 size={18} />
        </div>

        <div className="hidden group-data-[expanded=true]:block">
          <h2 className="text-sm font-bold text-slate-800">Platform</h2>
          <p className="text-xs text-slate-500">{accessLabel}</p>
        </div>
      </div>

      <nav className="space-y-2">
        {visibleSections.map((section) => {
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
                  {section.items
                    .filter((item) => item.href !== "/platform/settings/access" || canManageAccounts)
                    .filter((item) => !isSuperAdminView || section.title !== "Settings" || item.href === "/platform/settings/access")
                    .map((item) => {
                    const ItemIcon = item.icon;
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
                        className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 hover:text-slate-900"
                      >
                        <ItemIcon size={18} className="shrink-0 text-slate-500" />
                        <span className="hidden whitespace-nowrap group-data-[expanded=true]:block">
                          {item.label}
                        </span>
                        {attentionCount > 0 && <span aria-label={`${attentionCount} items need attention`} className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-800">{attentionCount}</span>}
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