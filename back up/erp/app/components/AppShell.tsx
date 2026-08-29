"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { defaultModuleCatalog, getAccessibleModules } from "../lib/modules";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "SA";
}

type Module = {
  label: string;
  eyebrow: string;
  items?: { label: string; href: string }[];
};

const modules: Module[] = defaultModuleCatalog;

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f4f6f3] text-zinc-950">
          <div className="min-h-[calc(100vh-72px)] px-5 py-7 sm:px-8 lg:px-10">{children}</div>
        </div>
      }
    >
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedModule, setSelectedModule] = useState("Order Management");
  const [activeItem, setActiveItem] = useState("Merchandising");
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const nextProfile = (payload?.user?.profileName || payload?.user?.name || "").trim();
        setProfileName(nextProfile);
      })
      .catch(() => setProfileName(""));
  }, []);

  const pathSegments = pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] ?? "";
  const workspaceUsername = pathSegments[0] === "workspace" ? decodeURIComponent(pathSegments[1] ?? "") : "";
  const workspaceOrganization = pathSegments[0] === "workspace" ? decodeURIComponent(pathSegments[2] ?? "") : "";
  const profileWorkspaceSlug = profileName ? slugify(profileName) : "";
  const orgSegment = workspaceOrganization
    ? slugify(workspaceOrganization)
    : pathSegments[0] && pathSegments[0] !== "workspace" && pathSegments[0] !== "merchandising" && pathSegments[0] !== "purchase" && pathSegments[0] !== "masters"
      ? pathSegments[0]
      : "";

  useEffect(() => {
    const canonicalPath = pathname ?? "";

    if (!canonicalPath || canonicalPath === "/workspace") {
      setSelectedModule("Order Management");
      setActiveItem("Merchandising");
      return;
    }

    const workspacePath = canonicalPath.replace(/^\/workspace\//, "");
    const nestedSegments = workspacePath.split("/").filter(Boolean);
    const nestedLast = nestedSegments[nestedSegments.length - 1] ?? "";

    const settingsPages = new Set(["settings", "setting", "masters", "permission", "subscription", "vendors", "onboarding"]);
    const orderPages = new Set(["merchandising", "order-management", "purchase"]);
    const modulePages = new Map([
      ["factory-management", ["Factory Management", "Factory Management"]],
      ["finance-management", ["Finance Management", "Finance Management"]],
      ["retail", ["Retail", "Retail"]],
      ["distribution", ["Distribution", "Distribution"]],
      ["tenants", ["Tenants", "Tenant List"]],
    ]);

    if (nestedSegments.length >= 2 && nestedLast === "tenants") {
      setSelectedModule("Tenants");
      setActiveItem("Tenant List");
      return;
    }

    if (nestedSegments.length >= 2 && settingsPages.has(nestedLast)) {
      setSelectedModule("Settings and Control");
      setActiveItem(nestedLast === "permission" ? "Permission" : nestedLast === "subscription" ? "Subscription" : "Masters");
      return;
    }

    if (nestedSegments.length >= 2 && orderPages.has(nestedLast)) {
      setSelectedModule("Order Management");
      setActiveItem(nestedLast === "purchase" ? "Purchase" : "Merchandising");
      return;
    }

    const moduleMatch = modulePages.get(nestedLast);
    if (nestedSegments.length >= 2 && moduleMatch) {
      setSelectedModule(moduleMatch[0]);
      setActiveItem(moduleMatch[1]);
      return;
    }

    if (nestedSegments.length >= 2) {
      setSelectedModule("Order Management");
      setActiveItem("Merchandising");
      return;
    }

    if (lastSegment === "tenants") {
      setSelectedModule("Tenants");
      setActiveItem("Tenant List");
      return;
    }

    if (lastSegment === "masters" || lastSegment === "vendors" || lastSegment === "onboarding" || lastSegment === "permission" || lastSegment === "subscription") {
      setSelectedModule("Settings and Control");
      setActiveItem(lastSegment === "permission" ? "Permission" : lastSegment === "subscription" ? "Subscription" : "Masters");
      return;
    }

    if (lastSegment === "settings" || lastSegment === "setting") {
      setSelectedModule("Settings and Control");
      setActiveItem("Masters");
      return;
    }

    if (lastSegment === "merchandising") {
      setSelectedModule("Order Management");
      setActiveItem("Merchandising");
      return;
    }

    if (lastSegment === "purchase" || pathname?.startsWith("/purchase")) {
      setSelectedModule("Order Management");
      setActiveItem("Purchase");
      return;
    }

    if (lastSegment === "factory-management") {
      setSelectedModule("Factory Management");
      setActiveItem("Factory Management");
      return;
    }

    if (lastSegment === "finance-management") {
      setSelectedModule("Finance Management");
      setActiveItem("Finance Management");
      return;
    }

    if (lastSegment === "retail") {
      setSelectedModule("Retail");
      setActiveItem("Retail");
      return;
    }

    if (lastSegment === "distribution") {
      setSelectedModule("Distribution");
      setActiveItem("Distribution");
      return;
    }

    if (pathname?.startsWith("/masters") || pathname?.startsWith("/settings") || pathname?.startsWith("/setting") || pathname === "/vendors" || pathname === "/onboarding") {
      setSelectedModule("Settings and Control");
      setActiveItem(pathname?.includes("permission") ? "Permission" : pathname?.includes("subscription") ? "Subscription" : "Masters");
      return;
    }

    if (pathname === "/merchandising") {
      setSelectedModule("Order Management");
      setActiveItem("Merchandising");
      return;
    }

    setSelectedModule("Order Management");
    setActiveItem("Merchandising");
  }, [pathname, orgSegment, lastSegment]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const organizationName = searchParams.get("org") ?? "Organization";
  const sidebarCollapsed = true;
  const organizationBadge = organizationName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "ORG";
  const currentUserInitials = getInitials(profileName || "Workspace Admin");

  const buildErpRoute = (path: string) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const canonical = normalized === "/merchandising"
      ? "/order-management/merchandising"
      : normalized === "/purchase"
        ? "/order-management/purchase"
        : normalized === "/masters"
          ? "/settings/masters"
          : normalized === "/tenants"
            ? "/tenants"
            : normalized === "/factory-management"
              ? "/factory-management"
              : normalized === "/finance-management"
                ? "/finance-management"
                : normalized === "/retail"
                  ? "/retail"
                  : normalized === "/distribution"
                    ? "/distribution"
                    : normalized;

    const activeOrgSlug = workspaceOrganization
      ? slugify(workspaceOrganization)
      : orgSegment || (organizationName && organizationName !== "Organization"
        ? organizationName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "organization"
        : "");

    const activeWorkspaceSlug = workspaceUsername
      ? slugify(workspaceUsername)
      : profileWorkspaceSlug || "workspace";

    if (activeOrgSlug) {
      return `/workspace/${activeWorkspaceSlug}/${activeOrgSlug}${canonical}`;
    }

    return canonical;
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      document.cookie = "erp_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
      router.push("/");
      router.refresh();
    }
  };

  const accessibleModules = useMemo(() => getAccessibleModules([
    { moduleName: "Order Management" },
    { moduleName: "Factory Management" },
    { moduleName: "Finance Management" },
    { moduleName: "Retail" },
    { moduleName: "Distribution" },
    { moduleName: "Settings and Control" },
  ]), []);

  const routeModule = pathname === "/workspace"
    ? "Order Management"
    : pathname?.startsWith("/workspace/")
      ? (() => {
          const nestedSegments = pathname.replace(/^\/workspace\//, "").split("/").filter(Boolean);
          const nestedLast = nestedSegments[nestedSegments.length - 1] ?? "";
          if (nestedSegments.length >= 2 && (nestedLast === "masters" || nestedLast === "permission" || nestedLast === "subscription" || nestedLast === "settings" || nestedLast === "setting" || nestedLast === "vendors" || nestedLast === "onboarding")) return "Settings and Control";
          if (nestedSegments.length >= 2 && (nestedLast === "merchandising" || nestedLast === "purchase" || nestedLast === "order-management")) return "Order Management";
          if (nestedSegments.length >= 2 && nestedLast === "tenants") return "Tenants";
          if (nestedSegments.length >= 2 && nestedLast === "factory-management") return "Factory Management";
          if (nestedSegments.length >= 2 && nestedLast === "finance-management") return "Finance Management";
          if (nestedSegments.length >= 2 && nestedLast === "retail") return "Retail";
          if (nestedSegments.length >= 2 && nestedLast === "distribution") return "Distribution";
          return "Order Management";
        })()
      : lastSegment === "masters" || lastSegment === "permission" || lastSegment === "subscription" || lastSegment === "setting" || lastSegment === "settings" || pathname === "/vendors" || pathname === "/onboarding" || pathname?.startsWith("/vendors") || pathname?.startsWith("/settings") || pathname?.startsWith("/setting")
        ? "Settings and Control"
        : lastSegment === "merchandising" || lastSegment === "purchase" || pathname?.startsWith("/purchase")
          ? "Order Management"
          : lastSegment === "tenants"
            ? "Tenants"
            : lastSegment === "factory-management"
              ? "Factory Management"
              : lastSegment === "finance-management"
                ? "Finance Management"
                : lastSegment === "retail"
                  ? "Retail"
                  : lastSegment === "distribution"
                    ? "Distribution"
                    : null;

  const resolvedActiveItem = pathname === "/workspace"
    ? "Merchandising"
    : pathname?.startsWith("/workspace/")
      ? (() => {
          const nestedSegments = pathname.replace(/^\/workspace\//, "").split("/").filter(Boolean);
          const nestedLast = nestedSegments[nestedSegments.length - 1] ?? "";
          if (nestedLast === "merchandising") return "Merchandising";
          if (nestedLast === "purchase") return "Purchase";
          if (nestedLast === "tenants") return "Tenant List";
          if (nestedLast === "permission") return "Permission";
          if (nestedLast === "subscription") return "Subscription";
          if (nestedLast === "masters" || nestedLast === "settings" || nestedLast === "setting") return "Masters";
          if (nestedLast === "factory-management") return "Factory Management";
          if (nestedLast === "finance-management") return "Finance Management";
          if (nestedLast === "retail") return "Retail";
          if (nestedLast === "distribution") return "Distribution";
          return "Merchandising";
        })()
      : lastSegment === "merchandising"
        ? "Merchandising"
        : lastSegment === "purchase" || pathname?.startsWith("/purchase")
          ? "Purchase"
          : lastSegment === "permission"
            ? "Permission"
            : lastSegment === "subscription"
              ? "Subscription"
              : lastSegment === "masters" || lastSegment === "setting" || lastSegment === "settings" || pathname === "/vendors" || pathname === "/onboarding"
                ? "Masters"
                : lastSegment === "tenants"
                  ? "Tenant List"
                  : lastSegment === "factory-management"
                    ? "Factory Management"
                    : lastSegment === "finance-management"
                      ? "Finance Management"
                      : lastSegment === "retail"
                        ? "Retail"
                        : lastSegment === "distribution"
                          ? "Distribution"
                          : activeItem;

  const effectiveModule = routeModule ?? selectedModule;
  const effectiveActiveItem = resolvedActiveItem;

  const visibleModules = accessibleModules.length > 0 ? accessibleModules : modules;
  const currentModule = visibleModules.find((item) => item.label === effectiveModule) ?? visibleModules[0] ?? modules[0];
  const sidebarWidth = sidebarCollapsed ? "w-[180px]" : "w-[220px]";

  return (
    <div className="min-h-screen bg-[#f4f6f3] text-zinc-950">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[#dce4dc] bg-[#10251d] text-white transition-[width] duration-200 lg:flex ${sidebarWidth}`}>
        <SidebarContent selectedModule={currentModule.label} activeItem={effectiveActiveItem} setActiveItem={setActiveItem} collapsed={sidebarCollapsed} modules={visibleModules} buildRoute={buildErpRoute} />
      </aside>

      <div className="lg:pl-[220px]">
        <header className="sticky top-0 z-20 border-b border-[#dce4dc] bg-[#f4f6f3]/95 px-5 backdrop-blur sm:px-8">
          <div className="flex h-[78px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-lg border border-[#dce4dc] bg-white text-lg lg:hidden" aria-label="Open navigation">≡</button>

              <div className="hidden items-center gap-2 rounded-xl border border-[#dce4dc] bg-white px-2.5 py-2 shadow-sm sm:flex">
                <div className="grid size-8 place-items-center rounded-lg bg-[#17372a] text-[11px] font-bold text-white">{organizationBadge}</div>
              </div>

              <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-xs">
                Module
                <select
                  value={effectiveModule}
                  onChange={(event) => {
                    const nextModule = visibleModules.find((module) => module.label === event.target.value);
                    setSelectedModule(event.target.value);
                    setActiveItem(nextModule?.items?.[0]?.label ?? "");
                      if (event.target.value === "Settings and Control") router.push(buildErpRoute("/masters"));
                    if (event.target.value === "Order Management") router.push(buildErpRoute("/merchandising"));
                    if (event.target.value === "Tenants") router.push(buildErpRoute("/tenants"));
                  }}
                  className="max-w-[155px] rounded-lg border border-[#cddbcf] bg-white px-2 py-2 text-xs font-semibold normal-case tracking-normal text-[#17372a] outline-none focus:border-emerald-700 sm:max-w-none sm:px-3 sm:text-sm"
                  aria-label="Select module"
                >
                  {visibleModules.map((module) => <option key={module.label}>{module.label}</option>)}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-3">
              {pathname === "/purchase" && <div className="hidden items-center rounded-lg border border-[#cddbcf] bg-white p-0.5 text-[11px] font-semibold sm:flex" aria-label="Purchase type"><Link href={`${buildErpRoute("/purchase")}?type=raw`} className={`rounded-md px-2.5 py-1.5 transition ${searchParams.get("type") !== "finished" ? "bg-[#17372a] text-white" : "text-zinc-500 hover:text-emerald-800"}`}>Raw Material</Link><Link href={`${buildErpRoute("/purchase")}?type=finished`} className={`rounded-md px-2.5 py-1.5 transition ${searchParams.get("type") === "finished" ? "bg-[#17372a] text-white" : "text-zinc-500 hover:text-emerald-800"}`}>Finished Goods</Link></div>}
              {pathname === "/purchase" && <Link href={`${buildErpRoute("/purchase")}?panel=approval&type=${searchParams.get("type") === "finished" ? "finished" : "raw"}`} className={`hidden rounded-lg border px-3 py-2 text-xs font-semibold transition sm:inline-flex ${searchParams.get("panel") === "approval" ? "border-[#17372a] bg-[#17372a] text-white" : "border-[#dce4dc] bg-white text-zinc-600 hover:border-emerald-700/40 hover:text-emerald-800"}`}>Approval Process</Link>}
              <Link href="/workspace" className="hidden rounded-md border border-[#dce4dc] bg-white p-2 text-zinc-600 transition hover:border-emerald-700/40 hover:text-emerald-800 sm:inline-flex sm:items-center sm:justify-center" aria-label="Back to organisations" title="Back to organisations">
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Logout"
                title="Logout"
                className="grid size-10 place-items-center rounded-full border border-red-200 bg-red-50 text-red-600 shadow-sm transition hover:bg-red-600 hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h6.4A1.8 1.8 0 0 1 19 5.8v12.4a1.8 1.8 0 0 1-1.8 1.8h-6.4A1.8 1.8 0 0 1 9 18.2V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 12H4m0 0 3-3m-3 3 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className="flex items-center gap-2 rounded-full border border-[#dce4dc] bg-white px-2 py-1.5 shadow-sm">
                <div className="grid size-9 place-items-center rounded-full bg-[#d9e9d7] text-xs font-bold text-[#1d503a]" title={profileName || "Workspace Admin"}>{currentUserInitials}</div>
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Profile Name</span>
                  <span className="mt-0.5 text-xs font-semibold text-[#17372a]">{profileName || "Workspace Admin"}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-72px)] px-5 py-7 sm:px-8 lg:px-10">{children}</main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/35 lg:hidden" role="presentation" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-[290px] bg-[#10251d] text-white" onClick={(event) => event.stopPropagation()}>
            <SidebarContent selectedModule={currentModule.label} activeItem={effectiveActiveItem} setActiveItem={setActiveItem} onNavigate={() => setMobileOpen(false)} modules={visibleModules} buildRoute={buildErpRoute} />
          </aside>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ selectedModule, activeItem, setActiveItem, collapsed = true, onToggle, onNavigate, modules, buildRoute }: { selectedModule: string; activeItem: string; setActiveItem: (label: string) => void; collapsed?: boolean; onToggle?: () => void; onNavigate?: () => void; modules: Module[]; buildRoute: (path: string) => string }) {
  const activeModule = modules.find((item) => item.label === selectedModule) ?? modules[0] ?? defaultModuleCatalog[0];

  return (
    <div className="flex h-full flex-col py-4 px-3">
      <nav className="mt-4 flex-1 space-y-1" aria-label="Main navigation">
        <div className="space-y-1">
          {activeModule.items?.map((item) => (
            <Link
              key={item.label}
              href={buildRoute(item.href)}
              onClick={() => { setActiveItem(item.label); onNavigate?.(); }}
              className={`block rounded-lg px-2 py-2.5 text-sm transition ${activeItem === item.label ? "bg-emerald-700 font-semibold text-white" : "text-emerald-100/65 hover:bg-white/10 hover:text-white"} ${collapsed ? "text-left" : ""}`}
              title={item.label}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
