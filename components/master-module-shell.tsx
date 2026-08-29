"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Layers, ArrowLeft } from "lucide-react";
import { MasterModuleSwitcher } from "@/components/master-module-switcher";

export const MASTER_MODULES = [
  { key: "order-management", label: "Order Management" },
  { key: "factory-management", label: "Factory Management" },
  { key: "finance-management", label: "Finance Management" },
  { key: "retails", label: "Retails" },
  { key: "distribution", label: "Distribution" },
  { key: "online", label: "Online" },
  { key: "approvals", label: "Approval" },
  { key: "settings", label: "Settings" },
] as const;

type SubItem = {
  key: string;
  label: string;
  href: string;
  count?: number;
};

type MasterModuleShellProps = {
  workspaceId: string;
  organizationId: string;
  organizationName: string;
  value: string;
  moduleLabel: string;
  title: string;
  description: string;
  children: ReactNode;
  modules?: SubItem[];
  subItems?: SubItem[];
};

export function MasterModuleShell({
  workspaceId,
  organizationId,
  organizationName,
  value,
  children,
  modules = [],
  subItems = [],
}: MasterModuleShellProps) {
  const pathname = usePathname();
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    merchandising: true,
  });

  const toggleExpand = (key: string) => {
    setExpandedModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const defaultModules: Record<string, SubItem[]> = {
    "order-management": [
      { key: "home", label: "Home", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management` },
      { key: "merchandising", label: "Merchandising", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising` },
      { key: "purchase", label: "Purchase", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/purchase` },
    ],
    settings: [
      { key: "overview", label: "Overview", href: `/workspace/${workspaceId}/organizations/${organizationId}/settings` },
      { key: "masters", label: "Masters", href: `/workspace/${workspaceId}/organizations/${organizationId}/settings/masters` },
    ],
    approvals: [
      { key: "settings", label: "Setting", href: `/workspace/${workspaceId}/organizations/${organizationId}/approvals/setting` },
    ],
  };

  const resolvedModules = modules.length > 0 ? modules : defaultModules[value] ?? [];

  const merchandisingTabs: SubItem[] = [
    { key: "order", label: "Orders", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order` },
    { key: "order-summary", label: "Order Summary", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order-summary` },
    { key: "samples", label: "Samples", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/samples` },
    { key: "bom", label: "BOM", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/bom` },
  ];

  const subSubItemMap: Record<string, SubItem[]> = {
    merchandising: merchandisingTabs,
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      {/* PREMIUM DARK LEFT SIDEBAR */}
      <aside className="flex w-70 flex-col border-r border-slate-800 bg-slate-900/90 backdrop-blur-xl">
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-400">CREDENCE CRAFT ERP</p>
            <h2 className="text-sm font-semibold text-white truncate max-w-[210px]">{organizationName}</h2>
          </div>
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
        </div>

        {/* Navigation Section */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Sub Modules
          </p>

          <nav className="space-y-1.5">
            {resolvedModules.map((subModule) => {
              const subSubItems = subSubItemMap[subModule.key] || [];
              const hasSubSub = subSubItems.length > 0;
              const isExpanded = expandedModules[subModule.key];
              const active = isActive(subModule.href);

              return (
                <div key={subModule.key} className="space-y-1">
                  <div
                    className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      active
                        ? "bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    <Link href={subModule.href} className="flex-1 truncate">
                      {subModule.label}
                    </Link>
                    {hasSubSub && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(subModule.key)}
                        className="p-1 text-slate-500 hover:text-slate-200"
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* EXPANDABLE SUB-SUB MODULES */}
                  {hasSubSub && isExpanded && (
                    <div className="ml-3 space-y-1 border-l border-slate-800 pl-3">
                      {subSubItems.map((child) => {
                        const childActive = isActive(child.href);
                        return (
                          <Link
                            key={child.key}
                            href={child.href}
                            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                              childActive
                                ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20"
                                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                            }`}
                          >
                            <span>{child.label}</span>
                            {typeof child.count === "number" && (
                              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                                {child.count}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Link */}
        <div className="border-t border-slate-800/80 p-3">
          <Link
            href={`/workspace/${workspaceId}`}
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Workspaces</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-950">
        {/* TOP BAR */}
        <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-500/10 p-1.5 border border-indigo-500/20">
              <Layers className="h-4 w-4 text-indigo-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              {value.replace("-", " ")}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Master Modules</span>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 px-1 py-1 shadow-inner">
              <MasterModuleSwitcher
                value={value}
                options={MASTER_MODULES.map((m) => ({ key: m.key, label: m.label }))}
              />
            </div>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1600px] rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 shadow-2xl backdrop-blur-xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}