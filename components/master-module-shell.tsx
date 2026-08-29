"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
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
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* LEFT SIDEBAR FOR SUBMODULES & EXPANDABLE SUB-SUBMODULES */}
      <aside className="flex w-64 flex-col border-r border-emerald-100 bg-white">
        <div className="flex h-16 items-center border-b border-emerald-100 px-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-700">CREDENCE CRAFT ERP</p>
            <h2 className="text-base font-semibold text-slate-900 truncate max-w-[200px]">{organizationName}</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-800">Sub Modules</p>
          <nav className="space-y-1">
            {resolvedModules.map((subModule) => {
              const subSubItems = subSubItemMap[subModule.key] || [];
              const hasSubSub = subSubItems.length > 0;
              const isExpanded = expandedModules[subModule.key];
              const active = isActive(subModule.href);

              return (
                <div key={subModule.key} className="space-y-1">
                  <div className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wider transition hover:bg-emerald-50">
                    <Link
                      href={subModule.href}
                      className={`flex-1 ${active ? "text-emerald-700 font-bold" : "text-slate-700 hover:text-emerald-700"}`}
                    >
                      {subModule.label}
                    </Link>
                    {hasSubSub && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(subModule.key)}
                        className="p-1 text-slate-400 hover:text-emerald-700"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {/* EXPANDABLE SUB-SUB MODULES */}
                  {hasSubSub && isExpanded && (
                    <div className="ml-3 space-y-1 border-l-2 border-emerald-100 pl-3">
                      {subSubItems.map((child) => {
                        const childActive = isActive(child.href);
                        return (
                          <Link
                            key={child.key}
                            href={child.href}
                            className={`block rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                              childActive
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                            }`}
                          >
                            {child.label}
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

        <div className="border-t border-emerald-100 p-3">
          <Link
            href={`/workspace/${workspaceId}`}
            className="block rounded-xl border border-emerald-100 bg-emerald-50/50 p-2 text-center text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            ← Back to Workspaces
          </Link>
        </div>
      </aside>

      {/* RIGHT MAIN CONTENT AREA */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* TOP BAR WITH TOP-RIGHT MASTER MODULE DROPDOWN */}
        <header className="flex h-16 items-center justify-between border-b border-emerald-100 bg-white px-6">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-emerald-700" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{value}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Master Modules</span>
            <MasterModuleSwitcher
              value={value}
              options={MASTER_MODULES.map((m) => ({ key: m.key, label: m.label }))}
            />
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[1600px] rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}