import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/database/prisma-client";
import { signValue } from "@/lib/auth/session-manager";

export type PlatformSessionAdmin = {
  id: string;
  admin_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  role: "SUPER_ADMIN" | "ADMIN";
  actualRole: "SUPER_ADMIN" | "ADMIN";
  team_role: "CMO" | "CTO" | null;
  mobile_number: string | null;
};

export type PlatformViewMode = "SUPER_ADMIN" | "ADMIN" | "CMO" | "CTO";

export const PLATFORM_SESSION_COOKIE_NAME = "cc_platform_session";
export const PLATFORM_VIEW_COOKIE_NAME = "cc_platform_view";
const PLATFORM_SESSION_TTL_SECONDS = 60 * 60 * 24;

export function getEffectivePlatformRole(
  actualRole: "SUPER_ADMIN" | "ADMIN",
  requestedView: string | undefined,
): "SUPER_ADMIN" | "ADMIN" {
  return actualRole === "SUPER_ADMIN" &&
    (requestedView === "ADMIN" || requestedView === "CMO" || requestedView === "CTO")
    ? "ADMIN"
    : actualRole;
}

export function getEffectivePlatformTeamRole(
  actualRole: "SUPER_ADMIN" | "ADMIN",
  requestedView: string | undefined,
  actualTeamRole: "CMO" | "CTO" | null,
): "CMO" | "CTO" | null {
  if (actualRole !== "SUPER_ADMIN") {
    return actualTeamRole;
  }

  return requestedView === "CMO" || requestedView === "CTO" ? requestedView : null;
}

export function assertPlatformSuperAdmin(admin: PlatformSessionAdmin) {
  if (admin.role !== "SUPER_ADMIN") {
    throw new Error("This action requires Super Admin access.");
  }
}

export function assertPlatformConfigurationAccess(admin: PlatformSessionAdmin) {
  if (admin.team_role) {
    throw new Error("CMO and CTO team accounts cannot access platform settings, plans, or databases.");
  }
}

export function createPlatformSessionToken(adminId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + PLATFORM_SESSION_TTL_SECONDS;
  const payload = `${adminId}.${expiresAt}`;
  return `${payload}.${signValue(`platform:${payload}`)}`;
}

export function verifyPlatformSessionToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const [adminId, expiresAtValue, signature] = token.split(".");

  if (!adminId || !expiresAtValue || !signature) {
    return null;
  }

  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const payload = `${adminId}.${expiresAtValue}`;
  if (signature !== signValue(`platform:${payload}`)) {
    return null;
  }

  return adminId;
}

export async function setPlatformSessionCookie(adminId: string) {
  const cookieStore = await cookies();
  const token = createPlatformSessionToken(adminId);

  cookieStore.delete(PLATFORM_VIEW_COOKIE_NAME);
  cookieStore.set(PLATFORM_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PLATFORM_SESSION_TTL_SECONDS,
  });
}

export async function getPlatformSessionAdmin(): Promise<PlatformSessionAdmin | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value ?? null;
  const requestedView = cookieStore.get(PLATFORM_VIEW_COOKIE_NAME)?.value;
  const adminId = verifyPlatformSessionToken(token);

  if (!adminId) {
    return null;
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { id: adminId } });

  if (!admin || !admin.is_active) {
    return null;
  }

  return {
    id: admin.id,
    admin_id: admin.admin_id,
    full_name: admin.full_name,
    email: admin.email,
    is_active: admin.is_active,
    role: getEffectivePlatformRole(admin.role, requestedView),
    actualRole: admin.role,
    team_role: getEffectivePlatformTeamRole(admin.role, requestedView, admin.team_role),
    mobile_number: admin.mobile_number,
  };
}

export async function requirePlatformSessionAdmin(): Promise<PlatformSessionAdmin> {
  const admin = await getPlatformSessionAdmin();

  if (!admin) {
    redirect("/");
  }

  return admin;
}

export async function requirePlatformSessionSuperAdmin(): Promise<PlatformSessionAdmin> {
  const admin = await requirePlatformSessionAdmin();
  assertPlatformSuperAdmin(admin);
  return admin;
}

export async function requirePlatformConfigurationAccess(): Promise<PlatformSessionAdmin> {
  const admin = await requirePlatformSessionAdmin();
  assertPlatformConfigurationAccess(admin);
  return admin;
}

export async function setPlatformViewMode(mode: PlatformViewMode) {
  const admin = await requirePlatformSessionAdmin();
  if (admin.actualRole !== "SUPER_ADMIN") {
    throw new Error("Only a Super Admin can switch platform views.");
  }
  if (mode !== "SUPER_ADMIN" && mode !== "ADMIN" && mode !== "CMO" && mode !== "CTO") {
    throw new Error("Select a valid platform view.");
  }

  const cookieStore = await cookies();
  if (mode !== "SUPER_ADMIN") {
    cookieStore.set(PLATFORM_VIEW_COOKIE_NAME, mode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PLATFORM_SESSION_TTL_SECONDS,
    });
  } else {
    cookieStore.delete(PLATFORM_VIEW_COOKIE_NAME);
  }
}

export async function logoutPlatformSession() {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_SESSION_COOKIE_NAME);
  cookieStore.delete(PLATFORM_VIEW_COOKIE_NAME);
}
