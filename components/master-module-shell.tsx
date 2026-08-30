"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Layers, ArrowLeft, Sparkles } from "lucide-react";
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
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-800 antialiased">
      {/* SIDEBAR NAVIGATION */}
      <motion.aside
        initial={false}
        animate={{ width: isHovered ? 230 : 56 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative z-30 flex flex-col border-r border-slate-200 bg-slate-900 text-slate-300 shadow-lg"
      >
        {/* BRANDING HEADER */}
        <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 font-bold text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-400">CREDENCE CRAFT</p>
                  <h2 className="text-xs font-semibold text-white truncate max-w-[130px]">{organizationName}</h2>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          <nav className="space-y-0.5">
            {resolvedModules.map((subModule) => {
              const subSubItems = subSubItemMap[subModule.key] || [];
              const hasSubSub = subSubItems.length > 0;
              const isExpanded = expandedModules[subModule.key];
              const active = isActive(subModule.href);

              return (
                <div key={subModule.key} className="space-y-0.5">
                  <div
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 transition-colors ${
                      active
                        ? "bg-emerald-600/20 text-emerald-300 font-semibold"
                        : "hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Link href={subModule.href} className="flex items-center gap-2 truncate flex-1">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-slate-500"}`} />
                      {isHovered && <span className="truncate text-xs">{subModule.label}</span>}
                    </Link>

                    {isHovered && hasSubSub && (
                      <button type="button" onClick={() => toggleExpand(subModule.key)} className="p-0.5 text-slate-400 hover:text-white">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </button>
                    )}
                  </div>

                  {isHovered && hasSubSub && isExpanded && (
                    <div className="ml-3 space-y-0.5 border-l border-slate-800 pl-2">
                      {subSubItems.map((child) => (
                        <Link
                          key={child.key}
                          href={child.href}
                          className={`flex items-center justify-between rounded-md px-2 py-1 text-[11px] transition-colors ${
                            isActive(child.href)
                              ? "bg-emerald-600 text-white font-medium"
                              : "text-slate-400 hover:bg-slate-800 hover:text-white"
                          }`}
                        >
                          <span className="truncate">{child.label}</span>
                          {typeof child.count === "number" && (
                            <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.2 text-[9px] font-bold text-slate-300">
                              {child.count}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* WORKSPACE BACK FOOTER */}
        <div className="border-t border-slate-800 p-1.5">
          <Link
            href={`/workspace/${workspaceId}`}
            className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/50 p-1.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            {isHovered && <span className="truncate">Workspaces</span>}
          </Link>
        </div>
      </motion.aside>

      {/* MAIN VIEWPORT CONTAINER */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* HEADER TOOLBAR */}
        <header className="flex h-11 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-600" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              {value.replace("-", " ")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Master Modules</span>
            <MasterModuleSwitcher
              value={value}
              options={MASTER_MODULES.map((m) => ({ key: m.key, label: m.label }))}
            />
          </div>
        </header>

        {/* PAGE CONTENT WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-1.5">
          <div className="h-full w-full rounded-md border border-slate-200 bg-white p-2.5 shadow-sm">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}