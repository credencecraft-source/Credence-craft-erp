"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Lock,
} from "lucide-react";

import { ERP_MODULES, getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
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
  restrictions?: any[]; 
  onLogout?: () => void | Promise<void>;
};

export function MasterModuleWrapper({
  workspaceId,
  organizationId,
  organizationName,
  children,
  modules = [],
  businessTypes = [],
  restrictions = [],
  onLogout,
}: MasterModuleWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();
  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;

  const checkIsBlocked = (targetPath: string) => {
    if (!restrictions || !restrictions.length) return null;

    const orgIndex = targetPath.indexOf(organizationId);
    if (orgIndex === -1) return null;

    const subPath = targetPath.substring(orgIndex + organizationId.length).replace(/^\/+/, "");
    const segments = subPath.split("/").filter(Boolean);

    const currentMaster = (segments[0] || "").toLowerCase();
    const currentMain = (segments[1] || "").toLowerCase();
    const currentSub = (segments[2] || "").toLowerCase();

    for (const rule of restrictions) {
      if (rule.restriction_type === "block" || rule.type === "BLOCK") {
        const ruleMaster = (rule.master_module || "").toLowerCase().replace(/\s+/g, "-");
        const ruleMain = (rule.main_module || "").toLowerCase().replace(/\s+/g, "-");
        const ruleSub = (rule.sub_module || "").toLowerCase().replace(/\s+/g, "-");

        const masterMatch = !ruleMaster || ruleMaster === "*" || ruleMaster === currentMaster;
        const mainMatch = !ruleMain || ruleMain === "*" || ruleMain === currentMain;
        const subMatch = !ruleSub || ruleSub === "*" || ruleSub === currentSub;

        if (masterMatch && mainMatch && subMatch) {
          return {
            message: rule.custom_message || rule.customAlertMessage || "Access to this module/feature is restricted by your current plan.",
          };
        }
      }
    }
    return null;
  };

  const currentBlockInfo = useMemo(() => {
    return checkIsBlocked(pathname);
  }, [restrictions, pathname, organizationPath]);

  useEffect(() => {
    if (currentBlockInfo && !pathname.includes("/access-blocked")) {
      const encodedMsg = encodeURIComponent(currentBlockInfo.message);
      router.replace(`${organizationPath}/access-blocked?message=${encodedMsg}`);
    }
  }, [currentBlockInfo, organizationPath, pathname, router]);

  const moduleOptions = useMemo(() => {
    if (businessTypes.length > 0) {
      return businessTypes.flatMap((businessType) => {
        const linkedModule = getErpModuleForBusinessTypeName(businessType.name);

        if (!linkedModule) return [];

        return [{
          key: businessType.id,
          label: businessType.name,
          moduleKey: linkedModule.key,
          pathSegment: linkedModule.pathSegment,
          children: linkedModule.children,
        }];
      });
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

    const normalizedActiveKey = (activeModule.moduleKey || activeModule.key)
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    
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

    const mapChild = (child: any, basePath: string): SubItem => {
      const segment = child.pathSegment || child.key;
      const currentHref = `${basePath}/${segment}`;
      return {
        key: child.key,
        label: child.label,
        href: currentHref,
        children: child.children?.map((nested: any) =>
          mapChild(nested, currentHref)
        ),
      };
    };

    return currentRegistry.children.map((child) =>
      mapChild(child, `${organizationPath}/${activeModule.pathSegment}`)
    );
  }, [activeModule, organizationPath]);

  const navigation = modules.length > 0 ? modules : dynamicNavigation;

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  // Recursive renderer for deeply nested sidebar elements (like BOM -> Order Summary)
  const renderTreeItem = (item: SubItem, level = 0) => {
    const active = isActive(item.href, true);
    const blockInfo = checkIsBlocked(item.href);
    const isBlocked = Boolean(blockInfo);
    const hasSubChildren = Boolean(item.children && item.children.length > 0);
    const isExpanded = expanded[item.key] ?? true;

    return (
      <div key={item.key} className="space-y-1">
        <div
          className={`flex items-center justify-between rounded-md transition ${
            isBlocked
              ? "bg-slate-900/40 opacity-50 cursor-not-allowed pointer-events-none text-slate-500"
              : active 
              ? "bg-emerald-600 text-white" 
              : "hover:bg-slate-800 text-slate-200"
          }`}
        >
          <Link
            href={isBlocked ? "#" : item.href}
            onClick={(e) => {
              if (isBlocked) {
                e.preventDefault();
                const encodedMsg = encodeURIComponent(blockInfo!.message);
                router.push(`${organizationPath}/access-blocked?message=${encodedMsg}`);
              }
            }}
            className="flex flex-1 items-center gap-3 px-3 py-2 text-sm"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isBlocked ? "bg-slate-700" : active ? "bg-white" : "bg-slate-500"
              }`}
            />
            {sidebarOpen && (
              <span className="flex-1 text-xs font-medium truncate">
                {item.label}
              </span>
            )}
            {isBlocked && sidebarOpen && (
              <Lock className="h-3 w-3 text-red-400 ml-auto" />
            )}
          </Link>

          {hasSubChildren && sidebarOpen && !isBlocked && (
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

        {hasSubChildren && isExpanded && sidebarOpen && !isBlocked && (
          <div className="ml-4 space-y-1 border-l border-slate-800 pl-2">
            {item.children!.map((subChild) => renderTreeItem(subChild, level + 1))}
          </div>
        )}
      </div>
    );
  };

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
            {navigation.map((item) => renderTreeItem(item))}
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

        <main className="flex-1 overflow-auto bg-slate-100 p-6">
          {currentBlockInfo ? (
            <div className="flex flex-col items-center justify-center h-[60vh] rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-4">
                <Lock className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Access Restricted</h2>
              <p className="text-sm text-slate-600 max-w-md mb-6">{currentBlockInfo.message}</p>
              <Link
                href={`${organizationPath}/settings/pricing/current-plan`}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition"
              >
                View Plan & Upgrade
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}