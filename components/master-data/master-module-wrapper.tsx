"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import { MasterModuleSwitcher } from "@/components/master-data/master-module-switcher";

type SubItem = {
  key: string;
  label: string;
  href: string;
  count?: number;
};

type BusinessTypeItem = {
  id: string;
  name: string;
};

type MasterModuleShellProps = {
  workspaceId: string;
  organizationId: string;
  organizationName: string;
  value?: string;
  moduleLabel?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  modules?: SubItem[];
  businessTypes?: BusinessTypeItem[];
};

export function MasterModuleShell({
  workspaceId,
  organizationId,
  organizationName,
  children,
  modules = [],
  businessTypes = [],
}: MasterModuleShellProps) {
  const pathname = usePathname();
  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;

  const moduleOptions = businessTypes.length > 0
    ? businessTypes.map((bt) => ({
        key: bt.id,
        label: bt.name,
        pathSegment: bt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      }))
    : ERP_MODULES;

  const activeModule =
    moduleOptions.find(({ pathSegment }) => {
      const modulePath = `${organizationPath}/${pathSegment}`;
      return pathname === modulePath || pathname.startsWith(`${modulePath}/`);
    }) ?? moduleOptions[0];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    merchandising: true,
    setting: true,
  });

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const defaultModules: Record<string, SubItem[]> = {
    "order-management": [
      {
        key: "home",
        label: "Home",
        href: `${organizationPath}/order-management`,
      },
      {
        key: "merchandising",
        label: "Merchandising",
        href: `${organizationPath}/order-management/merchandising`,
      },
      {
        key: "purchase",
        label: "Purchase",
        href: `${organizationPath}/order-management/purchase`,
      },
    ],
    "factory-management": [
      {
        key: "home",
        label: "Overview",
        href: `${organizationPath}/factory-management`,
      },
    ],
    approvals: [
      {
        key: "home",
        label: "Home",
        href: `${organizationPath}/approvals`,
      },
      {
        key: "setting",
        label: "Approval Settings",
        href: `${organizationPath}/approvals/approval-settings`,
      },
    ],
    settings: [
      {
        key: "overview",
        label: "Overview",
        href: `${organizationPath}/settings`,
      },
      {
        key: "masters",
        label: "Master Data",
        href: `${organizationPath}/settings/master-data`,
      },
      {
        key: "pricing-plan",
        label: "Pricing Plan",
        href: `${organizationPath}/settings/pricing/plan`,
      },
    ],
  };

  const fallbackDynamicModules: SubItem[] = [
    {
      key: "overview",
      label: "Overview",
      href: `${organizationPath}/${activeModule.pathSegment}`,
    },
  ];

  const navigation =
    modules.length > 0 
      ? modules 
      : defaultModules[activeModule.key] ?? defaultModules[activeModule.pathSegment] ?? fallbackDynamicModules;

  const merchandisingChildren: SubItem[] = [
    {
      key: "orders",
      label: "Orders",
      href: `${organizationPath}/order-management/merchandising/order`,
    },
    {
      key: "bom",
      label: "BOM",
      href: `${organizationPath}/order-management/merchandising/bom`,
    },
  ];

  const approvalChildren: SubItem[] = [
    {
      key: "master",
      label: "Master",
      href: `${organizationPath}/approvals/approval-settings/master-review`,
    },
  ];

  const childMap: Record<string, SubItem[]> = {
    merchandising: merchandisingChildren,
    setting: approvalChildren,
  };

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 60 }}
        transition={{ duration: 0.18 }}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        className="flex flex-col border-r border-slate-800 bg-slate-950 text-slate-200"
      >
        <div className="border-b border-slate-800 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-sm font-semibold text-white">
                    {organizationName}
                  </h2>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <nav className="space-y-1">
            {navigation.map((item) => {
              const children = childMap[item.key] ?? [];
              const hasChildren = children.length > 0;
              const opened = expanded[item.key];
              const active = hasChildren ? isActive(item.href, false) && children.some((c) => isActive(c.href)) : isActive(item.href, true);

              return (
                <div key={item.key}>
                  <div
                    className={`flex items-center justify-between rounded-md transition ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "hover:bg-slate-800"
                    }`}
                  >
                    <Link
                      href={item.href}
                      className="flex flex-1 items-center gap-3 px-3 py-2"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          active
                            ? "bg-white"
                            : "bg-slate-500"
                        }`}
                      />
                      {sidebarOpen && (
                        <span className="text-sm">{item.label}</span>
                      )}
                    </Link>

                    {sidebarOpen && hasChildren && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.key)}
                        className="mr-2"
                      >
                        {opened ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {sidebarOpen && hasChildren && opened && (
                    <div className="ml-6 mt-1 space-y-1">
                      {children.map((child) => (
                        <Link
                          key={child.key}
                          href={child.href}
                          className={`flex items-center justify-between rounded-md px-2 py-1 text-xs transition ${
                            isActive(child.href, true)
                              ? "bg-emerald-700 text-white"
                              : "text-slate-400 hover:bg-slate-800 hover:text-white"
                          }`}
                        >
                          <span>{child.label}</span>
                          {typeof child.count === "number" && (
                            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px]">
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

        <div className="border-t border-slate-800 p-2">
          <Link
            href={`/dashboard/${workspaceId}/home`}
            className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {sidebarOpen && <span className="text-sm">Back to Workspace</span>}
          </Link>
        </div>
      </motion.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-600" />
            <span className="font-semibold capitalize">{activeModule.label}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Master Modules</span>
            <MasterModuleSwitcher
              value={activeModule.key}
              options={moduleOptions}
            />
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-100 p-6">{children}</main>
      </div>
    </div>
  );
}