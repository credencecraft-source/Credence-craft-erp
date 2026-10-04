import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Bell, Home } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import {
  logoutPlatformSession,
  requirePlatformSessionAdmin,
  setPlatformViewMode,
} from "@/lib/auth/platform-session-manager";
import PlatformRootLayoutClient from "./_page-content/platform-root-layout";
import PlatformViewSelector from "./_page-content/platform-view-selector";
import { getPlatformSupportAttentionCounts } from "@/lib/services/organizations/support-ticket-service";

export default async function PlatformRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requirePlatformSessionAdmin();
  const attentionCounts = await getPlatformSupportAttentionCounts();
  const roleLabel = admin.team_role === "CMO"
    ? "CMO · Sales"
    : admin.team_role === "CTO"
      ? "CTO · Support"
      : admin.role === "SUPER_ADMIN"
        ? "Super Admin"
        : "Admin";
  const mobileNumber = admin.mobile_number ?? "Mobile not set";
  const contactDetails = `${admin.full_name} - ${admin.email} - ${mobileNumber}`;

  async function logoutAction() {
    "use server";
    await logoutPlatformSession();
    redirect("/");
  }

  async function switchPlatformView(formData: FormData) {
    "use server";
    const mode = String(formData.get("mode") ?? "");
    if (mode !== "ADMIN" && mode !== "SUPER_ADMIN" && mode !== "CMO" && mode !== "CTO") {
      throw new Error("Select a valid platform view.");
    }
    await setPlatformViewMode(mode);
    redirect("/platform/organisations");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen flex-col">
        <Navbar
          title={
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <h1 className="shrink-0 text-base font-bold tracking-tight text-slate-900 sm:text-lg">Platform</h1>
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800 sm:text-xs">
                {roleLabel}
              </span>
              <p className="min-w-0 truncate text-[10px] font-medium text-slate-500 sm:text-xs" title={contactDetails}>
                {contactDetails}
              </p>
            </div>
          }
        >
          <Link
            href="/platform/organisations"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
            aria-label="Platform home"
            title="Platform home"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <Link
            href="/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            aria-label="Go to app"
            title="Go to app"
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            <span>Go to app</span>
          </Link>
          <Link
            href="/platform/support-tickets"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            aria-label={`${attentionCounts.total} platform items need attention`}
            title={`Open tickets: ${attentionCounts.openTickets}; organization approvals: ${attentionCounts.pendingOrganizations}; subscription approvals: ${attentionCounts.pendingSubscriptions}`}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Attention</span>
            <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{attentionCounts.total}</span>
          </Link>
          <span className="hidden text-[10px] text-slate-500 xl:inline">
            Tickets {attentionCounts.openTickets} · Organizations {attentionCounts.pendingOrganizations} · Subscriptions {attentionCounts.pendingSubscriptions}
          </span>

          {admin.actualRole === "SUPER_ADMIN" && (
            <PlatformViewSelector action={switchPlatformView} value={admin.team_role ?? admin.role} />
          )}

          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm">
              Logout
            </Button>
          </form>
        </Navbar>

        <div className="flex min-h-0 flex-1">
          <PlatformRootLayoutClient
            accessLabel={admin.role === "SUPER_ADMIN" ? "Super Admin" : admin.team_role ?? "Admin"}
            isSuperAdminView={admin.role === "SUPER_ADMIN"}
            canManageAccounts={admin.role === "SUPER_ADMIN" || (admin.role === "ADMIN" && admin.team_role === null)}
            canAccessConfiguration={admin.team_role === null}
            attentionCounts={attentionCounts}
          />
          <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}