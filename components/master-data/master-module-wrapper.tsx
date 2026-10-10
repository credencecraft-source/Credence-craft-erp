"use client";

import type { SegmentRestriction } from "@prisma/client";
import { useState, useMemo, useEffect, useTransition, useCallback, useRef, type ReactNode } from "react";
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
  Headset,
  Factory,
  Gauge,
  Landmark,
  LayoutGrid,
  Lock,
  Package,
  Settings,
  Sparkles,
  Trash2,
  Truck,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  LoaderCircle,
  PanelsTopLeft,
} from "lucide-react";

import {
  ERP_MODULES,
  getErpBusinessTypeDisplayName,
  getErpModuleForBusinessTypeName,
  type ErpModule,
  type SubModuleOption,
} from "@/components/erp/erp-config-registry";
import { MasterModuleSwitcher } from "@/components/master-data/master-module-switcher";
import { SupportTicketTrigger } from "@/components/organizations/support-ticket-trigger";
import OrganizationTrialStatus from "@/components/organizations/organization-trial-status";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Tabs from "@/components/ui/Tabs";
import NavigationLinkStatus from "@/components/ui/navigation-link-status";
import { getSidebarFeatureKeysForRoute, normalizeRestrictionPart, restrictionMatchesHiddenRoute, restrictionMatchesRoute } from "@/lib/services/platform/plan-restriction-matcher";
import { isOrganizationTrialInactive } from "@/lib/utilities/organization-trial-visibility";

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

type ModuleRestriction = Pick<
  SegmentRestriction,
  "restriction_type" | "master_module" | "main_module" | "sub_module" | "action_level" | "custom_message"
> & {
  type?: string;
  customAlertMessage?: string | null;
  plan_module_path?: string | null;
};

type NavigationModuleOption = Pick<ErpModule, "key" | "label" | "pathSegment" | "children"> & {
  moduleKey?: string;
};

const DUMMY_DATA_WIZARD_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const moduleIcons = {
  online: Gauge,
  pos: Landmark,
  "order-management": ClipboardList,
  "design-development": BriefcaseBusiness,
  "factory-management": Factory,
  "quality-management-system": Boxes,
  "finance-management": Landmark,
  "inventory-management": Package,
  distribution: Truck,
  "security-management": Lock,
  approvals: ClipboardList,
  settings: Settings,
  admin: LayoutGrid,
} as const;

type MasterModuleWrapperProps = {
  workspaceId: string;
  organizationId: string;
  organizationName: string;
  canAccessPlatformControlPanel: boolean;
  hasConfiguredPricingType: boolean;
  pricingMode: string;
  userMonthlyPrice: number;
  requiresUserPricingToAccess: boolean;
  trialEnabled: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  startDummyDataWizardStep: (step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) => Promise<{ status?: string; stage?: string; error?: string }>;
  deleteDummyData: () => Promise<{ deleted: boolean; error?: string }>;
  kycToolbarControl?: ReactNode;
  dummyDataStatus: {
    status: string;
    stage?: string;
    orderNo: string | null;
    orderCount?: number;
    masterCount: number;
    currentStep?: number | null;
    completedSteps?: number[];
    groupedPurchaseOrders?: Array<{
      id: string;
      grouped_po_no: string;
      status: string;
      vendor_price: number | string | null;
      gst: number | string | null;
      hsn_code: string | null;
      buying_uom: string | null;
    }>;
    masterGroupCount?: number;
    purchaseOrderCount?: number;
    gateEntryCount?: number;
    grnCount?: number;
    verificationLineCount?: number;
    verifiedLineCount?: number;
    verificationAllocationCount?: number;
    completedOrderAllocationCount?: number;
    sampleWorkOrderCount?: number;
  };
  value?: string;
  moduleLabel?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  modules?: SubItem[];
  businessTypes?: BusinessTypeItem[];
  restrictions?: ModuleRestriction[];
  onLogout?: () => void | Promise<void>;
};

export function MasterModuleWrapper({
  workspaceId,
  organizationId,
  organizationName,
  canAccessPlatformControlPanel,
  hasConfiguredPricingType,
  pricingMode,
  userMonthlyPrice,
  requiresUserPricingToAccess,
  trialEnabled,
  trialStartedAt,
  trialEndsAt,
  startDummyDataWizardStep,
  deleteDummyData,
  kycToolbarControl,
  dummyDataStatus = { status: "UNAVAILABLE", orderNo: null, masterCount: 0 },
  children,
  modules = [],
  businessTypes = [],
  restrictions = [],
  onLogout,
}: MasterModuleWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();
  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;
  const isBillingOrSupportRoute =
    pathname.startsWith(`${organizationPath}/settings/pricing`)
    || pathname.startsWith(`${organizationPath}/support-tickets`);
  const visibilityStorageKey = `erp-visible-modules:${organizationId}`;
  const [trialExpired, setTrialExpired] = useState(false);
  const trialNeedsPricing = isOrganizationTrialInactive(trialEnabled, trialStartedAt, trialEndsAt)
    || trialExpired;

  const checkIsBlocked = useCallback((targetPath: string) => {
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
  }, [organizationId, restrictions]);

  const checkIsHidden = useCallback((targetPath: string) => {
    if (!restrictions || !restrictions.length) return false;

    const orgIndex = targetPath.indexOf(organizationId);
    if (orgIndex === -1) return false;

    const subPath = targetPath.substring(orgIndex + organizationId.length).replace(/^\/+/, "");
    const segments = subPath.split("/").filter(Boolean);
    const featureKeys = getSidebarFeatureKeysForRoute(segments);
    const targetModule = normalizeRestrictionPart(segments[0] || "");

    return restrictions.some((rule) => {
      const owningModule = normalizeRestrictionPart(rule.plan_module_path || "");
      if (owningModule && owningModule !== targetModule) return false;
      return restrictionMatchesHiddenRoute(rule, segments, featureKeys);
    });
  }, [organizationId, restrictions]);

  const currentBlockInfo = useMemo(() => {
    return checkIsBlocked(pathname);
  }, [checkIsBlocked, pathname]);

  useEffect(() => {
    if (currentBlockInfo && !pathname.includes("/access-blocked")) {
      const encodedMsg = encodeURIComponent(currentBlockInfo.message);
      router.replace(`${organizationPath}/access-blocked?message=${encodedMsg}`);
    }
  }, [currentBlockInfo, organizationPath, pathname, router]);

  const allModuleOptions = useMemo<NavigationModuleOption[]>(() => {
    if (businessTypes.length > 0) {
      return businessTypes.flatMap((businessType) => {
        const linkedModule = getErpModuleForBusinessTypeName(businessType.name);

        if (!linkedModule) return [];

        return [{
          key: businessType.id,
          label: getErpBusinessTypeDisplayName(businessType.name),
          moduleKey: linkedModule.key,
          pathSegment: linkedModule.pathSegment,
          children: linkedModule.children,
        }];
      });
    }
    return ERP_MODULES;
  }, [businessTypes]);

  const [hiddenModuleKeys, setHiddenModuleKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];

    try {
      const storedVisibleKeys = JSON.parse(localStorage.getItem(visibilityStorageKey) || "null");
      if (!Array.isArray(storedVisibleKeys)) return [];

      const visibleKeys = allModuleOptions
        .map((option) => option.key)
        .filter((key) => storedVisibleKeys.includes(key));
      if (visibleKeys.length === 0) return [];

      return allModuleOptions
        .map((option) => option.key)
        .filter((key) => !visibleKeys.includes(key));
    } catch {
      return [];
    }
  });
  const [moduleSettingsOpen, setModuleSettingsOpen] = useState(false);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [dummyDataHelpOpen, setDummyDataHelpOpen] = useState(false);
  const [dummyDataTab, setDummyDataTab] = useState<"create" | "delete">("create");
  const [dummyDataStateOverride, setDummyDataStateOverride] = useState<boolean | null>(null);
  const [dummyDataDeleteError, setDummyDataDeleteError] = useState("");
  const [dummyDataDeleteNotice, setDummyDataDeleteNotice] = useState("");
  const [dummyDataDeletionStatus, setDummyDataDeletionStatus] = useState<"planned" | "deleting" | "complete" | null>(null);
  const [dummyDataDeleteConfirmOpen, setDummyDataDeleteConfirmOpen] = useState(false);
  const [dummyDataBuildStep, setDummyDataBuildStep] = useState<number | null>(null);
  const [dummyDataBuildError, setDummyDataBuildError] = useState("");
  const [dummyDataBuildFailedStep, setDummyDataBuildFailedStep] = useState<number | null>(null);
  const [isBuildingDummyData, setIsBuildingDummyData] = useState(false);
  const [isRemovingDummyData, setIsRemovingDummyData] = useState(false);
  const dummyDataBuildRunningRef = useRef(false);
  const stopDummyDataBuildRef = useRef(false);
  const deleteAfterDummyDataBuildRef = useRef(false);
  const [isUpdatingDummyData, startUpdatingDummyData] = useTransition();
  const dummyDataActive = dummyDataStateOverride ?? !["EMPTY", "SCHEMA_NOT_READY", "UNAVAILABLE"].includes(dummyDataStatus.status);
  const dummyDataAvailable = !["SCHEMA_NOT_READY", "UNAVAILABLE"].includes(dummyDataStatus.status);
  const completedSteps = new Set(dummyDataStatus.completedSteps ?? []);
  const currentStep = dummyDataStatus.currentStep ?? (dummyDataStatus.status === "EMPTY" ? 1 : null);
  const sampleGroups = dummyDataStatus.groupedPurchaseOrders ?? [];

  function handleStartDummyDataStep(step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
    setDummyDataDeleteError("");
    setDummyDataDeleteNotice("");
    startUpdatingDummyData(async () => {
      const result = await startDummyDataWizardStep(step);
      if (result.error) {
        setDummyDataDeleteError(result.error);
        return;
      }
      setDummyDataStateOverride(true);
      setDummyDataDeleteNotice(`Step ${step} completed.`);
      router.refresh();
    });
  }

  function handleDeleteDummyData() {
    setDummyDataDeleteError("");
    setDummyDataDeleteConfirmOpen(true);
  }

  const performDeleteDummyData = useCallback(async () => {
    setDummyDataDeleteError("");
    setIsRemovingDummyData(true);
    setDummyDataDeletionStatus("deleting");
    try {
      const result = await deleteDummyData();
      if (result.error) {
        setDummyDataDeleteError(result.error);
        setDummyDataDeletionStatus(null);
        return;
      }
      setDummyDataStateOverride(false);
      setDummyDataDeleteNotice(result.deleted ? "Dummy data was deleted." : "There is no dummy dataset to delete.");
      setDummyDataDeletionStatus("complete");
      setDummyDataDeleteConfirmOpen(false);
      setDummyDataHelpOpen(false);
      router.refresh();
    } catch (error) {
      setDummyDataDeleteError(error instanceof Error ? error.message : "Unable to delete sample data.");
      setDummyDataDeletionStatus(null);
    } finally {
      setIsRemovingDummyData(false);
    }
  }, [deleteDummyData, router]);

  const runDummyDataBuild = useCallback(async (startStep: number) => {
    if (dummyDataBuildRunningRef.current) return;

    dummyDataBuildRunningRef.current = true;
    stopDummyDataBuildRef.current = false;
    setIsBuildingDummyData(true);
    setDummyDataBuildError("");
    setDummyDataBuildFailedStep(null);
    setDummyDataDeleteNotice("");

    try {
      for (const step of DUMMY_DATA_WIZARD_STEPS) {
        if (step < startStep) continue;
        if (stopDummyDataBuildRef.current) break;
        setDummyDataBuildStep(step);
        const result = await startDummyDataWizardStep(step);
        if (result.error && !stopDummyDataBuildRef.current) {
          setDummyDataBuildError(result.error);
          setDummyDataBuildFailedStep(step);
          return;
        }
        if (step === 1 && !result.error) setDummyDataStateOverride(true);
      }

      if (stopDummyDataBuildRef.current) {
        if (deleteAfterDummyDataBuildRef.current) {
          deleteAfterDummyDataBuildRef.current = false;
          await performDeleteDummyData();
        }
        return;
      }

      setDummyDataBuildStep(null);
      setDummyDataDeleteNotice("Sample data is ready to explore.");
      router.refresh();
    } catch (error) {
      setDummyDataBuildError(error instanceof Error ? error.message : "Unable to continue sample-data setup.");
      setDummyDataBuildFailedStep((current) => current ?? startStep);
    } finally {
      dummyDataBuildRunningRef.current = false;
      setIsBuildingDummyData(false);
      setDummyDataBuildStep(null);
    }
  }, [performDeleteDummyData, router, startDummyDataWizardStep]);

  function confirmDeleteDummyData() {
    setDummyDataDeleteError("");
    setDummyDataDeletionStatus("planned");
    if (dummyDataBuildRunningRef.current) {
      deleteAfterDummyDataBuildRef.current = true;
      stopDummyDataBuildRef.current = true;
      setDummyDataDeleteNotice("Stopping sample-data setup before removing its records...");
      return;
    }
    startUpdatingDummyData(async () => {
      await performDeleteDummyData();
    });
  }

  useEffect(() => {
    const resumableStatuses = ["IN_PROGRESS", "AWAITING_GROUPED_APPROVAL", "AWAITING_PO_APPROVAL"];
    if (!dummyDataAvailable || !resumableStatuses.includes(dummyDataStatus.status)) return;

    const startStep = dummyDataStatus.currentStep ?? 1;
    const timeoutId = window.setTimeout(() => {
      void runDummyDataBuild(startStep);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [dummyDataAvailable, dummyDataStatus.currentStep, dummyDataStatus.status, runDummyDataBuild]);

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

    const mapChild = (child: SubModuleOption, basePath: string): SubItem => {
      const segment = child.pathSegment || child.key;
      const currentHref = child.href
        ? `${organizationPath}${child.href}`
        : `${basePath}/${segment}`;
      return {
        key: child.key,
        label: child.label,
        href: currentHref,
        children: child.children?.map((nested) =>
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
    if (checkIsHidden(item.href)) return null;
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
                return;
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
              <span className="flex-1 truncate text-sm font-medium">
                {item.label}
              </span>
            )}
            <NavigationLinkStatus
              expanded={sidebarOpen}
              label={item.label}
              showOverlay
            />
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
    <div
      className="erp-organization-shell flex h-dvh w-full min-h-0 min-w-0 max-w-full overflow-hidden bg-slate-100"
      style={{ "--organization-sidebar-width": sidebarOpen ? "15rem" : "3.75rem" } as React.CSSProperties}
    >
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? "15rem" : "3.75rem" }}
        transition={{ duration: 0.18 }}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        className="flex shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-200"
      >
        <div className="shrink-0 border-b border-slate-800 p-3">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <nav className="space-y-1">
            {navigation.map((item) => renderTreeItem(item))}
          </nav>
        </div>

        <div className="shrink-0 border-t border-slate-800 p-2">
          <Link
            href={`/dashboard/${workspaceId}/home`}
            className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {sidebarOpen && <span className="text-sm">Back to Workspace</span>}
          </Link>
        </div>
      </motion.aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" />
              <span className="truncate font-semibold capitalize">{activeModule?.label ?? "Modules"}</span>
            </div>
            {isBuildingDummyData ? (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800" role="status" aria-live="polite">
                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-emerald-700" aria-hidden="true" />
                <span className="truncate">
                  We’re preparing sample data{dummyDataBuildStep ? ` · step ${dummyDataBuildStep} of 9` : ""}. Some areas may feel a little slower during setup.
                </span>
              </div>
            ) : dummyDataDeletionStatus ? (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" role="status" aria-live="polite">
                {dummyDataDeletionStatus !== "complete" ? (
                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-amber-700" aria-hidden="true" />
                ) : null}
                <span className="truncate">
                  {dummyDataDeletionStatus === "planned"
                    ? "Deletion planned. We’re stopping sample-data setup before removing its records."
                    : dummyDataDeletionStatus === "deleting"
                      ? "Sample-data deletion is in progress."
                      : "Sample data was deleted."}
                </span>
              </div>
            ) : dummyDataDeleteError ? (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800" role="alert">
                <span className="truncate">Sample-data deletion failed: {dummyDataDeleteError}</span>
              </div>
            ) : dummyDataBuildError ? (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" role="alert">
                <span className="truncate">Sample-data setup paused: {dummyDataBuildError}</span>
                {dummyDataBuildFailedStep ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isRemovingDummyData}
                    onClick={() => void runDummyDataBuild(dummyDataBuildFailedStep)}
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
            {dummyDataAvailable && dummyDataActive ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                aria-haspopup="dialog"
                disabled={isUpdatingDummyData || isRemovingDummyData || dummyDataDeletionStatus === "planned" || dummyDataDeletionStatus === "deleting"}
                onClick={() => {
                  setDummyDataTab("delete");
                  setDummyDataDeleteConfirmOpen(false);
                  setDummyDataHelpOpen(true);
                }}
                className="h-9 rounded-md border-[var(--erp-danger)] bg-[var(--erp-surface)] px-3 text-[var(--erp-danger)] hover:bg-[var(--erp-danger)] hover:text-white"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Delete Sample Data</span>
                <span className="sm:hidden">Delete Samples</span>
              </Button>
            ) : null}
            {kycToolbarControl}
            {trialNeedsPricing && hasConfiguredPricingType && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPricingDialogOpen(true)}
                aria-label="Open subscription and pricing"
                aria-haspopup="dialog"
                title="Subscription and pricing"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 p-0 text-amber-600 transition-colors hover:border-amber-300 hover:bg-amber-100 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <Crown className="h-4 w-4" />
              </Button>
            )}
            {!requiresUserPricingToAccess && (
              <OrganizationTrialStatus
                organizationId={organizationId}
                trialEnabled={trialEnabled}
                trialStartedAt={trialStartedAt}
                trialEndsAt={trialEndsAt}
                onExpiryChange={setTrialExpired}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Manage sample data"
              aria-haspopup="dialog"
              title="Manage sample data"
              onClick={() => {
                setDummyDataTab("create");
                setDummyDataHelpOpen(true);
              }}
              className="h-9 w-9 rounded-md border border-emerald-200 bg-emerald-50 p-0 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800 focus-visible:ring-emerald-500"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </Button>
            {canAccessPlatformControlPanel && (
              <Link
                href="/platform/organisations"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                aria-label="Open platform Control Panel"
                title="Open platform Control Panel"
              >
                <PanelsTopLeft className="h-4 w-4" aria-hidden="true" />
                <span>Control Panel</span>
              </Link>
            )}
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

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-4 lg:p-8">
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
        open={!isBillingOrSupportRoute && (pricingDialogOpen || requiresUserPricingToAccess)}
        onClose={() => {
          if (!requiresUserPricingToAccess) setPricingDialogOpen(false);
        }}
        closeOnBackdrop={!requiresUserPricingToAccess}
        ariaLabelledBy="subscription-pricing-title"
        ariaDescribedBy="subscription-pricing-description"
        size="md"
      >
        <div className={`border-b px-5 py-4 ${requiresUserPricingToAccess ? "border-[var(--erp-border)] bg-[var(--erp-brand-soft)]" : "border-amber-100 bg-amber-50/70"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-lg border bg-white ${requiresUserPricingToAccess ? "border-[var(--erp-border)] text-[var(--erp-brand)]" : "border-amber-200 text-amber-700"}`}>
                <Crown className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${requiresUserPricingToAccess ? "text-[var(--erp-brand)]" : "text-amber-700"}`}>
                  {requiresUserPricingToAccess ? "Trial ended" : "Organization billing"}
                </p>
                <h2 id="subscription-pricing-title" className="mt-1 text-base font-semibold text-[var(--erp-text)]">
                  {requiresUserPricingToAccess ? "Choose a subscription to continue" : "Subscription and pricing"}
                </h2>
              </div>
            </div>
            {!requiresUserPricingToAccess && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Close subscription and pricing dialog"
                onClick={() => setPricingDialogOpen(false)}
                className="h-8 w-8 rounded-md p-0 text-slate-500 hover:text-slate-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-3 p-5">
          <p id="subscription-pricing-description" className="text-sm leading-5 text-[var(--erp-muted)]">
            {requiresUserPricingToAccess
              ? "Your organization trial has ended. Choose a User Based subscription to restore organization access."
              : "Review your active modules or choose plans for this organization."}
          </p>
          {requiresUserPricingToAccess && (
            <OrganizationTrialStatus
              organizationId={organizationId}
              trialEnabled={trialEnabled}
              trialStartedAt={trialStartedAt}
              trialEndsAt={trialEndsAt}
              onExpiryChange={setTrialExpired}
            />
          )}
          {requiresUserPricingToAccess && pricingMode === "USER_BASED" && (
            <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4 text-sm font-semibold text-[var(--erp-text)]">
              ₹{userMonthlyPrice.toLocaleString("en-IN", { useGrouping: false, maximumFractionDigits: 2 })}
              <span className="ml-1 font-normal text-[var(--erp-muted)]">per user license / month</span>
            </p>
          )}
          <Link
            href={`${organizationPath}/settings/pricing/plan`}
            onClick={() => setPricingDialogOpen(false)}
            className="flex items-center justify-between rounded-lg border border-[var(--erp-brand)] bg-[var(--erp-brand)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--erp-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
          >
            <span>{requiresUserPricingToAccess ? "View pricing and subscribe" : "Browse plans and pricing"}</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {requiresUserPricingToAccess && (
            <Link
              href={`${organizationPath}/support-tickets`}
              onClick={() => setPricingDialogOpen(false)}
              className="flex items-center gap-3 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3 text-sm font-semibold text-[var(--erp-text)] transition-colors hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
            >
              <Headset className="h-4 w-4 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
              Create a support ticket
            </Link>
          )}
          {!requiresUserPricingToAccess && (
            <Link
              href={`${organizationPath}/settings/pricing/current-plan`}
              onClick={() => setPricingDialogOpen(false)}
              className="flex items-center justify-between rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3 text-sm font-semibold text-[var(--erp-text)] transition-colors hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
            >
              <span>Current subscription</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </Modal>

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

      <Modal
        open={dummyDataHelpOpen}
        onClose={() => {
          setDummyDataHelpOpen(false);
          setDummyDataDeleteConfirmOpen(false);
        }}
        ariaLabelledBy="dummy-data-help-title"
        ariaDescribedBy="dummy-data-help-description"
        size="lg"
        className="max-h-[88vh]"
      >
        <div className="border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold text-emerald-700">Organization setup</p>
                <h2 id="dummy-data-help-title" className="mt-0.5 text-lg font-semibold text-slate-950">Sample data</h2>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Close sample data information"
              onClick={() => setDummyDataHelpOpen(false)}
              className="h-8 w-8 rounded-md p-0 text-slate-500 hover:text-slate-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="max-h-[calc(88vh-5rem)] space-y-5 overflow-y-auto p-5">
          <Tabs
            tabs={[
              { id: "dummy-data-create-tab", value: "create", label: "Create sample data", panelId: "dummy-data-create-panel" },
              { id: "dummy-data-delete-tab", value: "delete", label: "Remove sample data", panelId: "dummy-data-delete-panel" },
            ]}
            value={dummyDataTab}
            onChange={setDummyDataTab}
            ariaLabel="Sample data actions"
          />
          {dummyDataStatus.status === "SCHEMA_NOT_READY" ? (
            <p className="text-sm text-amber-800" role="status">
              Dummy-data tracking must be deployed before sample data can be managed.
            </p>
          ) : null}
          {dummyDataStatus.status === "UNAVAILABLE" ? (
            <p className="text-sm text-red-700" role="alert">
              Organization settings permission is required to manage dummy data.
            </p>
          ) : null}

            <section
            id="dummy-data-create-panel"
            role="tabpanel"
            aria-labelledby="dummy-data-create-tab"
            hidden={dummyDataTab !== "create"}
            className="space-y-5"
          >
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">Build a sample workflow</h3>
                <p id="dummy-data-help-description" className="text-sm leading-5 text-slate-600">
                  Complete each step in order. Your progress is saved for this organization.
                </p>
              </div>
              {dummyDataStatus.status === "EMPTY" ? (
                <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3.5" role="status">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <p className="text-sm leading-5 text-emerald-900">
                    No sample data exists yet. Start with Step 1 to create the sample masters, orders, and BOM.
                  </p>
                </div>
              ) : null}
              <ol className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                {[
                  { number: 1 as const, title: "Create Master, Orders, and BOM", detail: "Add sample masters, a current-store vendor, opening raw-material stock, ten draft orders, finished goods, and BOM rows." },
                  { number: 2 as const, title: "Create Grouping", detail: "Take available sample inventory for a few materials and allocate the remaining BOM quantities across ten vendor grouped purchase orders." },
                  { number: 3 as const, title: "Add Price, GST, HSN, Buying UOM, and Approve", detail: "Assign sample terms and approve every vendor- and stock-source grouped purchase order." },
                  { number: 4 as const, title: "Create Master Grouping", detail: "Create a master group for every approved vendor- and stock-source grouped purchase order." },
                  { number: 5 as const, title: "Create and Approve Purchase Orders", detail: "Generate at least ten vendor Purchase Orders, submit each for approval, and approve every PO." },
                  { number: 6 as const, title: "Create RM Gate Entries", detail: "Create five inward gate entries and five pending GRNs, each linked to a different approved Purchase Order." },
                  { number: 7 as const, title: "Verify Sample GRNs", detail: "Verify every GRN material line with varied physical quantities using the standard verification workflow." },
                  { number: 8 as const, title: "Allocate Verified GRNs", detail: "Allocate each verified quantity from the first grouped order line downward, then submit every allocation." },
                  { number: 9 as const, title: "Create Sample Work Orders", detail: "Create work orders for five sample orders using their assigned process template and size quantities." },
                ].map((step) => {
                  const isComplete = completedSteps.has(step.number);
                  const isCurrent = currentStep === step.number;
                  const canStart = dummyDataAvailable && isCurrent && !isComplete && !isUpdatingDummyData && !isBuildingDummyData;
                  return (
                    <li key={step.number} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700" aria-hidden="true">
                        {isComplete ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : isCurrent && isUpdatingDummyData ? <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" /> : step.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">Step {step.number}: {step.title}</span>
                          {isComplete ? <span className="text-xs font-medium text-emerald-700">Complete</span> : null}
                          {!isComplete && isCurrent && !isUpdatingDummyData ? <span className="text-xs font-medium text-sky-700">Up next</span> : null}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-600">{step.detail}</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={!canStart}
                        onClick={() => handleStartDummyDataStep(step.number)}
                      >
                        {isComplete ? "Done" : isUpdatingDummyData && isCurrent ? "Working..." : step.number === 9 ? "Create work orders" : dummyDataStatus.status === "EMPTY" && step.number === 1 ? "Create" : "Start"}
                      </Button>
                    </li>
                  );
                })}
              </ol>
              {dummyDataStatus.status === "EMPTY" ? null : (
                <p className="text-xs text-slate-500" role="status">
                  {dummyDataStatus.orderCount ?? 0} orders · {sampleGroups.length} grouped POs · {dummyDataStatus.masterGroupCount ?? 0} master groups · {dummyDataStatus.purchaseOrderCount ?? 0} purchase orders · {dummyDataStatus.gateEntryCount ?? 0} gate entries · {dummyDataStatus.grnCount ?? 0} GRNs · {dummyDataStatus.verifiedLineCount ?? 0}/{dummyDataStatus.verificationLineCount ?? 0} verified lines · {dummyDataStatus.completedOrderAllocationCount ?? 0}/{dummyDataStatus.verificationAllocationCount ?? 0} allocated · {dummyDataStatus.sampleWorkOrderCount ?? 0}/5 work orders
                </p>
              )}
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button type="button" variant="secondary" onClick={() => setDummyDataHelpOpen(false)}>
                  Close
                </Button>
              </div>
          </section>
          <section
            id="dummy-data-delete-panel"
            role="tabpanel"
            aria-labelledby="dummy-data-delete-tab"
            hidden={dummyDataTab !== "delete"}
            className="space-y-4"
          >
            {dummyDataDeleteConfirmOpen ? (
              <>
                <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <h3 className="text-base font-semibold text-rose-900">Confirm sample data deletion</h3>
                  <p className="text-sm leading-5 text-rose-800">
                    This permanently removes the generated sample records. Organization setup and baseline master values will be kept.
                    {dummyDataStatus.orderNo ? ` This includes ${dummyDataStatus.orderCount ?? 1} sample orders, starting with ${dummyDataStatus.orderNo}.` : ""}
                  </p>
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDummyDataDeleteConfirmOpen(false)}
                    disabled={isUpdatingDummyData || isRemovingDummyData || dummyDataDeletionStatus === "planned" || dummyDataDeletionStatus === "deleting"}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={confirmDeleteDummyData}
                    disabled={isUpdatingDummyData || isRemovingDummyData || dummyDataDeletionStatus === "planned" || dummyDataDeletionStatus === "deleting"}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {dummyDataDeletionStatus === "planned"
                      ? "Waiting for setup to stop..."
                      : dummyDataDeletionStatus === "deleting" || isUpdatingDummyData || isRemovingDummyData
                        ? "Deleting..."
                        : "Confirm Delete"}
                  </Button>
                </div>
              </>
            ) : (
              <>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Remove sample data</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Remove the generated sample records. Organization setup and baseline master values will be kept.
                </p>
              </div>
              {dummyDataActive ? (
                <p className="text-sm text-slate-600" role="status">
                  {dummyDataStatus.orderNo
                    ? `${dummyDataStatus.orderCount ?? 1} sample orders · first ${dummyDataStatus.orderNo} · ${dummyDataStatus.masterCount} master records.`
                    : "A dummy-data batch exists for this organization."}
                </p>
              ) : (
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4" role="status">
                  <p className="text-sm text-slate-700">There is no sample data to remove. Start creating it from Step 1.</p>
                  <Button type="button" size="sm" variant="primary" onClick={() => setDummyDataTab("create")}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Go to Step 1
                  </Button>
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setDummyDataHelpOpen(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteDummyData}
                  disabled={isUpdatingDummyData || isRemovingDummyData || !dummyDataActive}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete Sample Data
                </Button>
              </div>
              </>
            )}
          </section>
          {dummyDataDeleteNotice ? <p className="text-sm text-emerald-700" role="status">{dummyDataDeleteNotice}</p> : null}
          {dummyDataDeleteError ? <p className="text-sm text-red-700" role="alert">{dummyDataDeleteError}</p> : null}
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