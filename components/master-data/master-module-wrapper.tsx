"use client";

import { useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import { MasterModuleSwitcher } from "@/components/master-data/master-module-switcher";

type SubItem = {
  key: string;
  label: string;
  href: string;
  count?: number;
  children?: SubItem[];
};

type BusinessTypeItem = {
  id: string;
  name: string;
};

type MasterModuleWrapperProps = {
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
  onLogout?: () => void | Promise<void>;
};

export function MasterModuleWrapper({
  workspaceId,
  organizationId,
  organizationName,
  children,
  modules = [],
  businessTypes = [],
  onLogout,
}: MasterModuleWrapperProps) {
  const pathname = usePathname();
  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;

  const moduleOptions = useMemo(() => {
    if (businessTypes.length > 0) {
      return businessTypes.map((bt) => ({
        key: bt.id,
        label: bt.name,
        pathSegment: bt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        children: [],
      }));
    }
    return ERP_MODULES;
  }, [businessTypes]);

  const activeModule = useMemo(() => {
    return (
      moduleOptions.find(({ pathSegment }) => {
        const modulePath = `${organizationPath}/${pathSegment}`;
        return pathname === modulePath || pathname.startsWith(`${modulePath}/`);
      }) ?? moduleOptions[0]
    );
  }, [moduleOptions, organizationPath, pathname]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const dynamicNavigation = useMemo<SubItem[]>(() => {
    if (!activeModule) return [];

    const normalizedActiveKey = activeModule.key.toLowerCase().replace(/[\s_]+/g, "-");
    
    const currentRegistry = ERP_MODULES.find(
      (m) => m.key.toLowerCase().replace(/[\s_]+/g, "-") === normalizedActiveKey
    );

    if (!currentRegistry || !currentRegistry.children) {
      return [
        {
          key: "overview",
          label: "Overview",
          href: `${organizationPath}/${activeModule.pathSegment}`,
        },
      ];
    }

    const mapChild = (child: any, basePath: string): SubItem => ({
      key: child.key,
      label: child.label,
      href: `${basePath}/${child.key}`,
      children: child.children?.map((nested: any) =>
        mapChild(nested, `${basePath}/${child.key}`)
      ),
    });

    return currentRegistry.children.map((child) =>
      mapChild(child, `${organizationPath}/${activeModule.pathSegment}`)
    );
  }, [activeModule, organizationPath]);

  const navigation = modules.length > 0 ? modules : dynamicNavigation;

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
              const active = isActive(item.href, true);
              const hasSubChildren = Boolean(item.children && item.children.length > 0);
              const isExpanded = expanded[item.key] ?? true;

              return (
                <div key={item.key} className="space-y-1">
                  <div
                    className={`flex items-center justify-between rounded-md transition ${
                      active ? "bg-emerald-600 text-white" : "hover:bg-slate-800"
                    }`}
                  >
                    <Link
                      href={item.href}
                      className="flex flex-1 items-center gap-3 px-3 py-2 text-sm"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          active ? "bg-white" : "bg-slate-500"
                        }`}
                      />
                      {sidebarOpen && (
                        <span className="flex-1 text-xs font-medium">
                          {item.label}
                        </span>
                      )}
                    </Link>

                    {hasSubChildren && sidebarOpen && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.key)}
                        className="px-2 py-2 text-slate-400 hover:text-white"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {hasSubChildren && isExpanded && sidebarOpen && (
                    <div className="ml-4 space-y-1 border-l border-slate-800 pl-2">
                      {item.children!.map((subChild) => {
                        const subActive = isActive(subChild.href, true);

                        return (
                          <Link
                            key={subChild.key}
                            href={subChild.href}
                            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition ${
                              subActive
                                ? "bg-emerald-700 text-white font-medium"
                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                            }`}
                          >
                            <span>{subChild.label}</span>
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
              onLogout={onLogout}
            />
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-100 p-6">{children}</main>
      </div>
    </div>
  );
}