"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  const [isHovered, setIsHovered] = useState(false);
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
    <div className="flex h-screen overflow-hidden bg-slate-100/80 font-sans text-slate-800 antialiased">
      {/* HOVER ANIMATED LEFT SIDEBAR */}
      <motion.aside
        initial={false}
        animate={{ width: isHovered ? 260 : 76 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative z-30 flex flex-col border-r border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/50 backdrop-blur-xl"
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200/80 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-600/30">
              CC
            </span>
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="whitespace-nowrap"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">CREDENCE CRAFT</p>
                  <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[150px]">{organizationName}</h2>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation Area */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {isHovered && (
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Sub Modules
            </p>
          )}

          <nav className="space-y-1.5">
            {resolvedModules.map((subModule) => {
              const subSubItems = subSubItemMap[subModule.key] || [];
              const hasSubSub = subSubItems.length > 0;
              const isExpanded = expandedModules[subModule.key];
              const active = isActive(subModule.href);

              return (
                <div key={subModule.key} className="space-y-1">
                  <div
                    className={`flex items-center justify-between rounded-xl p-2.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                        : "text-slate-600 hover:bg-slate-100 hover:text-emerald-700"
                    }`}
                  >
                    <Link href={subModule.href} className="flex items-center gap-3 truncate flex-1">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                      {isHovered && <span className="truncate">{subModule.label}</span>}
                    </Link>

                    {isHovered && hasSubSub && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(subModule.key)}
                        className="p-1 hover:opacity-80"
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* EXPANDABLE SUB-SUB MODULES */}
                  {isHovered && hasSubSub && isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="ml-3 space-y-1 border-l-2 border-slate-200 pl-3"
                    >
                      {subSubItems.map((child) => {
                        const childActive = isActive(child.href);
                        return (
                          <Link
                            key={child.key}
                            href={child.href}
                            className={`block rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                              childActive
                                ? "bg-slate-900 text-white font-semibold"
                                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Link */}
        <div className="border-t border-slate-200/80 p-3">
          <Link
            href={`/workspace/${workspaceId}`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-emerald-700 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-slate-500" />
            {isHovered && <span className="truncate">Back to Workspaces</span>}
          </Link>
        </div>
      </motion.aside>

      {/* MAIN CONTENT CONTAINER */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* TOP BAR */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 border border-emerald-100">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {value.replace("-", " ")}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Master Modules</span>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-inner">
              <MasterModuleSwitcher
                value={value}
                options={MASTER_MODULES.map((m) => ({ key: m.key, label: m.label }))}
              />
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1600px] rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-xl shadow-slate-200/40 backdrop-blur-md">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}