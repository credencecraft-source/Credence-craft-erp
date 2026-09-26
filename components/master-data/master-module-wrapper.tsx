"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  ArrowLeft,
  Boxes,
  BriefcaseBusiness,
  ClipboardList,
  Crown,
  Factory,
  Gauge,
  Landmark,
  LayoutGrid,
  Lock,
  Package,
  Settings,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { ERP_MODULES, getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
import { MasterModuleSwitcher } from "@/components/master-data/master-module-switcher";
import { SupportTicketTrigger } from "@/components/organizations/support-ticket-trigger";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { getSidebarFeatureKeysForRoute, normalizeRestrictionPart, restrictionMatchesRoute } from "@/lib/services/platform/plan-restriction-matcher";

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

const moduleIcons = {
  online: Gauge,
  pos: Landmark,
  "order-management": ClipboardList,
  "design-development": BriefcaseBusiness,
  "factory-management": Factory,
  "quality-management-system": Boxes,
  "finance-management": Landmark,
  "inventory-management": Package,
  "security-management": Lock,
  approvals: ClipboardList,
  settings: Settings,
  admin: LayoutGrid,
} as const;

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
  const visibilityStorageKey = `erp-visible-modules:${organizationId}`;

  const checkIsBlocked = (targetPath: string) => {
    if (!restrictions || !restrictions.length) return null;

    const orgIndex = targetPath.indexOf(organizationId);
    if (orgIndex === -1) return null;

    const subPath = targetPath.substring(orgIndex + organizationId.length).replace(/^\/+/, "");
    const segments = subPath.split("/").filter(Boolean);

    const featureKeys = getSidebarFeatureKeysForRoute(segments);
    const targetModule = normalizeRestrictionPart(segments[0] || "");

    for (const rule of restrictions) {
      if (rule.restriction_type === "block" || rule.type === "BLOCK") {
        const owningModule = normalizeRestrictionPart(rule.plan_module_path || "");
        if (owningModule && owningModule !== targetModule) continue;
        if (restrictionMatchesRoute(rule, segments, featureKeys)) {
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

  const allModuleOptions = useMemo(() => {
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

  const [hiddenModuleKeys, setHiddenModuleKeys] = useState<string[]>([]);
  const [moduleSettingsOpen, setModuleSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      const storedVisibleKeys = JSON.parse(localStorage.getItem(visibilityStorageKey) || "null");
      if (Array.isArray(storedVisibleKeys)) {
        const visibleKeys = allModuleOptions
          .map((option) => option.key)
          .filter((key) => storedVisibleKeys.includes(key));
        if (visibleKeys.length > 0) {
          setHiddenModuleKeys(
            allModuleOptions
              .map((option) => option.key)
              .filter((key) => !visibleKeys.includes(key)),
          );
        }
      }
    } catch {
      // Ignore malformed local preferences and use the default visibility.
    }
  }, [allModuleOptions, visibilityStorageKey]);

  const moduleOptions = useMemo(
    () => allModuleOptions.filter((option) => !hiddenModuleKeys.includes(option.key)),
    [allModuleOptions, hiddenModuleKeys],
  );

  const toggleModuleVisibility = (moduleKey: string) => {
    const isHidden = hiddenModuleKeys.includes(moduleKey);
    if (!isHidden && moduleOptions.length === 1) return;

    const nextHiddenKeys = isHidden
      ? hiddenModuleKeys.filter((key) => key !== moduleKey)
      : [...hiddenModuleKeys, moduleKey];
    const nextVisibleKeys = allModuleOptions
      .map((option) => option.key)
      .filter((key) => !nextHiddenKeys.includes(key));

    setHiddenModuleKeys(nextHiddenKeys);
    localStorage.setItem(visibilityStorageKey, JSON.stringify(nextVisibleKeys));
  };

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
  const [blockedNotice, setBlockedNotice] = useState<{ message: string; label: string } | null>(null);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const dynamicNavigation = useMemo<SubItem[]>(() => {
    if (!activeModule) return [];

    const normalizedActiveKey = ((activeModule as any).moduleKey || activeModule.key)
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
      const currentHref = child.href
        ? `${organizationPath}${child.href}`
        : `${basePath}/${segment}`;
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
              ? "bg-amber-400/10 text-amber-100 ring-1 ring-inset ring-amber-300/20 hover:bg-amber-400/20"
              : active 
              ? "bg-emerald-600 text-white" 
              : "hover:bg-slate-800 text-slate-200"
          }`}
        >
          <Link
            href={item.href}
            onClick={(e) => {
              if (isBlocked) {
                e.preventDefault();
                setBlockedNotice({ message: blockInfo!.message, label: item.label });
              }
            }}
            className="flex flex-1 items-center gap-3 px-3 py-2 text-sm"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isBlocked ? "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.65)]" : active ? "bg-white" : "bg-slate-500"
              }`}
            />
            {sidebarOpen && (
              <span className="flex-1 text-xs font-medium truncate">
                {item.label}
              </span>
            )}
            {isBlocked && sidebarOpen && (
              <Lock className="ml-auto h-3.5 w-3.5 text-amber-300" />
            )}
          </Link>

          {hasSubChildren && sidebarOpen && !isBlocked && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => toggleExpand(item.key)}
              className="px-2 py-2 text-slate-400 hover:text-white"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>

        {hasSubChildren && isExpanded && sidebarOpen && (
          <div className="ml-4 space-y-1 border-l border-slate-800 pl-2">
            {item.children!.map((subChild) => renderTreeItem(subChild, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-slate-100">
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
        <header className="flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-600" />
            <span className="truncate font-semibold capitalize">{activeModule?.label ?? "Modules"}</span>
          </div>

          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
            <Link
              href={`${organizationPath}/settings/pricing/plan`}
              aria-label="Open subscription and pricing"
              title="Subscription and pricing"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:border-amber-300 hover:bg-amber-100 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <Crown className="h-4 w-4" />
            </Link>
            <SupportTicketTrigger organizationId={organizationId} />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-label="Configure visible modules"
              title="Configure visible modules"
              onClick={() => setModuleSettingsOpen(true)}
              className="h-9 w-9 rounded-md border border-slate-200 p-0 text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <MasterModuleSwitcher
              value={activeModule?.key ?? moduleOptions[0]?.key ?? ""}
              options={moduleOptions}
              onLogout={onLogout}
            />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto bg-slate-100 p-2 sm:p-4">
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

      <Modal
        open={moduleSettingsOpen}
        onClose={() => setModuleSettingsOpen(false)}
        ariaLabelledBy="module-visibility-title"
        size="lg"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600">Workspace view</p>
              <h2 id="module-visibility-title" className="mt-1 text-lg font-semibold text-slate-900">Visible modules</h2>
              <p className="mt-1 text-xs text-slate-500">Choose which modules appear in the header menu.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-label="Close module settings"
              onClick={() => setModuleSettingsOpen(false)}
              className="px-2 text-xl leading-none text-slate-400 hover:text-slate-700"
            >
              &times;
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          {allModuleOptions.map((option) => {
            const isVisible = !hiddenModuleKeys.includes(option.key);
            const iconKey = "moduleKey" in option && option.moduleKey ? option.moduleKey : option.key;
            const Icon = moduleIcons[iconKey as keyof typeof moduleIcons] || LayoutGrid;
            const canHide = isVisible && moduleOptions.length > 1;

            return (
              <Button
                variant="ghost"
                size="sm"
                key={option.key}
                type="button"
                onClick={() => toggleModuleVisibility(option.key)}
                className={`flex min-h-20 flex-col items-start justify-between rounded-lg border p-3 text-left transition ${
                  isVisible
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:border-emerald-300"
                    : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300"
                }`}
                aria-pressed={isVisible}
                title={!canHide && isVisible ? "At least one module must remain visible" : undefined}
              >
                <span className="flex w-full items-center justify-between">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md ${isVisible ? "bg-white text-emerald-600" : "bg-slate-200 text-slate-400"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${isVisible ? "bg-emerald-500" : "bg-slate-300"}`} />
                </span>
                <span className="mt-2 line-clamp-2 text-xs font-semibold">{option.label}</span>
              </Button>
            );
          })}
        </div>
      </Modal>

      {blockedNotice && <Modal open onClose={() => setBlockedNotice(null)} ariaLabelledBy="blocked-module-title" size="md">
          <div className="w-full overflow-hidden">
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 pb-7 pt-6 text-white">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/20 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/15 text-amber-200">
                  <Lock className="h-6 w-6" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setBlockedNotice(null)}
                  aria-label="Close access message"
                  className="rounded-full px-2 py-1 text-xl leading-none text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  &times;
                </Button>
              </div>
              <p className="relative mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Plan access</p>
              <h2 id="blocked-module-title" className="relative mt-1 text-xl font-bold">{blockedNotice.label} is locked</h2>
            </div>
            <div className="space-y-5 p-6">
              <p className="text-sm leading-6 text-slate-600">{blockedNotice.message}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  size="md"
                  type="button"
                  onClick={() => setBlockedNotice(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Continue browsing
                </Button>
                <Link
                  href={`${organizationPath}/settings/pricing/plan`}
                  onClick={() => setBlockedNotice(null)}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
                >
                  View plans
                </Link>
              </div>
            </div>
          </div>
      </Modal>}
    </div>
  );
}