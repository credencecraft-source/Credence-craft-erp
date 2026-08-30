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
    setting: true,
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
    "factory-management": [
      { key: "home", label: "Overview", href: `/workspace/${workspaceId}/organizations/${organizationId}/factory-management` },
    ],
    approvals: [
      { key: "home", label: "Home", href: `/workspace/${workspaceId}/organizations/${organizationId}/approvals` },
      { key: "setting", label: "Setting", href: `/workspace/${workspaceId}/organizations/${organizationId}/approvals/setting` },
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

  const approvalSettingTabs: SubItem[] = [
    { key: "master", label: "Master", href: `/workspace/${workspaceId}/organizations/${organizationId}/approvals/setting/master` },
  ];

  const subSubItemMap: Record<string, SubItem[]> = {
    merchandising: merchandisingTabs,
    setting: approvalSettingTabs,
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div >
      {/* SIDEBAR NAVIGATION */}
      <motion.aside
        initial={false}
        animate={{ width: isHovered ? 220 : 52 }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        
      >
        {/* BRANDING HEADER */}
        <div >
          <div >
            <span >
              <Sparkles  />
            </span>
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  
                >
                  <p >CREDENCE CRAFT</p>
                  <h2 >{organizationName}</h2>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div >
          <nav >
            {resolvedModules.map((subModule) => {
              const subSubItems = subSubItemMap[subModule.key] || [];
              const hasSubSub = subSubItems.length > 0;
              const isExpanded = expandedModules[subModule.key];
              const active = isActive(subModule.href);

              return (
                <div key={subModule.key} >
                  <div
                    className={`flex items-center justify-between rounded px-2 py-1 transition-colors ${
                      active
                        ? "bg-emerald-600 text-white font-semibold"
                        : "hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Link href={subModule.href} >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-white" : "bg-slate-500"}`} />
                      {isHovered && <span >{subModule.label}</span>}
                    </Link>

                    {isHovered && hasSubSub && (
                      <button type="button" onClick={() => toggleExpand(subModule.key)} >
                        {isExpanded ? <ChevronDown  /> : <ChevronRight  />}
                      </button>
                    )}
                  </div>

                  {isHovered && hasSubSub && isExpanded && (
                    <div >
                      {subSubItems.map((child) => (
                        <Link
                          key={child.key}
                          href={child.href}
                          className={`flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                            isActive(child.href)
                              ? "bg-emerald-600/30 text-emerald-300 font-bold"
                              : "text-slate-400 hover:bg-slate-800 hover:text-white"
                          }`}
                        >
                          <span >{child.label}</span>
                          {typeof child.count === "number" && (
                            <span >
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
        <div >
          <Link
            href={`/workspace/${workspaceId}`}
            
          >
            <ArrowLeft  />
            {isHovered && <span >Workspaces</span>}
          </Link>
        </div>
      </motion.aside>

      {/* MAIN VIEWPORT CONTAINER */}
      <div >
        {/* HEADER TOOLBAR */}
        <header >
          <div >
            <Layers  />
            <span >
              {value.replace("-", " ")}
            </span>
          </div>

          <div >
            <span >Master Modules</span>
            <MasterModuleSwitcher
              value={value}
              options={MASTER_MODULES.map((m) => ({ key: m.key, label: m.label }))}
            />
          </div>
        </header>

        {/* PAGE CONTENT WORKSPACE - ULTRA HIGH DENSITY ERP LAYOUT */}
        <main >
          <div >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}