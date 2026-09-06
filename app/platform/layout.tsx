import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Navbar from "@/components/ui/Navbar";
import Button from "@/components/ui/Button";
import {
  logoutPlatformSession,
  requirePlatformSessionAdmin,
} from "@/lib/auth/platform-session-manager";
import PlatformRootLayoutClient from "./_page-content/platform-root-layout";

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
      <PlatformRootLayoutClient />

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