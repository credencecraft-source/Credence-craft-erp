import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import Navbar from "@/components/ui/Navbar";
import Sidebar from "@/components/ui/Sidebar";
import Button from "@/components/ui/Button";
import { requirePlatformSessionAdmin, logoutPlatformSession } from "@/lib/auth/platform-session-manager";

const PLATFORM_NAV_ITEMS = [
  { key: "clients", label: "Clients", href: "/platform/clients" },
  { key: "plans", label: "Plans", href: "/platform/plans" },
  { key: "setup-plans", label: "Setup Plans", href: "/platform/setup-plans" },
  { key: "databases", label: "Databases", href: "/platform/databases" },
  { key: "business-types", label: "Business Types", href: "/platform/business-types" },
] as const;

export default async function PlatformRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requirePlatformSessionAdmin();

  async function logoutAction() {
    "use server";
    await logoutPlatformSession();
    redirect("/");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar>
        <p className="px-2 pb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Platform Admin
        </p>
        <nav className="space-y-1">
          {PLATFORM_NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </Sidebar>

      <div className="flex flex-1 flex-col">
        <Navbar title="Support Platform">
          <span className="text-sm text-slate-600">{admin.full_name}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm">
              Logout
            </Button>
          </form>
        </Navbar>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}