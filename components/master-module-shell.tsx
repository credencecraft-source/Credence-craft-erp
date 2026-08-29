"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const isActiveRoute = (items: SubItem[], href: string) => {
    const matchingItem = items
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((first, second) => second.href.length - first.href.length)[0];

    return matchingItem?.href === href;
  };
  const isMerchandisingSection = pathname.startsWith(
    `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising`,
  );
  const merchandisingTabs: SubItem[] = [
    { key: "order", label: "Orders", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order` },
    { key: "order-summary", label: "Order Summary", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order-summary` },
    { key: "samples", label: "Samples", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/samples` },
    { key: "bom", label: "BOM", href: `/workspace/${workspaceId}/organizations/${organizationId}/order-management/merchandising/bom` },
  ];
  const isOrderManagementModuleList = subItems.some((item) => ["home", "merchandising", "purchase"].includes(item.key));
  const resolvedSubItems =
    value === "order-management"
      ? isMerchandisingSection
        ? [...merchandisingTabs]
        : []
      : value === "approvals"
        ? subItems
        : isOrderManagementModuleList
          ? []
          : subItems;

  return (
    <main className="min-h-screen bg-transparent p-0 text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col">
        <header className="sticky top-0 z-20 border-b border-emerald-100/80 bg-white/90 px-5 py-4 shadow-[0_8px_30px_rgba(20,83,45,0.05)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-700">Credence Craft ERP</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-900">{organizationName}</h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link
                href={`/workspace/${workspaceId}`}
                className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                Workspace
              </Link>

              <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-1.5 shadow-sm">
                <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Master Modules
                </span>
                <MasterModuleSwitcher
                  value={value}
                  options={MASTER_MODULES.map((module) => ({ key: module.key, label: module.label }))}
                />
              </div>
            </div>
          </div>
        </header>

        {resolvedModules.length > 0 ? (
          <div className="border-b border-emerald-100/70 bg-white/70 px-5 py-3 backdrop-blur-xl sm:px-6">
            <div className="mx-auto max-w-[1600px]">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-1.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Modules</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {resolvedModules.map((tab) => {
                    const isActive = isActiveRoute(resolvedModules, tab.href);

                    return (
                      <Link
                        key={tab.key}
                        href={tab.href}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                          isActive
                            ? "border-emerald-300 bg-emerald-600 text-white shadow-sm"
                            : "border-transparent bg-white/70 text-slate-600 hover:border-emerald-200 hover:bg-white hover:text-emerald-700"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {resolvedSubItems.length > 0 ? (
          <div className="border-b border-emerald-100/70 bg-white/70 px-5 py-3 backdrop-blur-xl sm:px-6">
            <div className="mx-auto max-w-[1600px]">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-1.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Sub modules</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {resolvedSubItems.map((tab) => {
                    const isActive = isActiveRoute(resolvedSubItems, tab.href);

                    return (
                      <Link
                        key={tab.key}
                        href={tab.href}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                          isActive
                            ? "border-emerald-300 bg-emerald-600 text-white shadow-sm"
                            : "border-transparent bg-white/70 text-slate-600 hover:border-emerald-200 hover:bg-white hover:text-emerald-700"
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>{tab.label}</span>
                          {typeof tab.count === "number" ? (
                              <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              {tab.count}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 p-4 sm:p-5 lg:p-6">
          <div className="min-w-0 flex-1">
            <div className="rounded-[24px] border border-emerald-100/80 bg-white/90 p-4 shadow-[0_18px_50px_rgba(20,83,45,0.07)] backdrop-blur-xl sm:p-5">{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
