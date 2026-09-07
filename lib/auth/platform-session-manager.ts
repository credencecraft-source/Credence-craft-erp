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
};

export const PLATFORM_SESSION_COOKIE_NAME = "cc_platform_session";

export function createPlatformSessionToken(adminId: string) {
  return `${adminId}.${signValue(`platform:${adminId}`)}`;
}

export function verifyPlatformSessionToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const [adminId, signature] = token.split(".");

  if (!adminId || !signature) {
    return null;
  }

  if (signature !== signValue(`platform:${adminId}`)) {
    return null;
  }

  return adminId;
}

export async function setPlatformSessionCookie(adminId: string) {
  const cookieStore = await cookies();
  const token = createPlatformSessionToken(adminId);

  cookieStore.set(PLATFORM_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day, shorter than customer session
  });
}

export async function getPlatformSessionAdmin(): Promise<PlatformSessionAdmin | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value ?? null;
  const adminId = verifyPlatformSessionToken(token);

  if (!adminId) {
    return null;
  }

  try {
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
    };
  } catch {
    return null;
  }
}

export async function requirePlatformSessionAdmin(): Promise<PlatformSessionAdmin> {
  const admin = await getPlatformSessionAdmin();

  if (!admin) {
    redirect("/");
  }

  return admin;
}

export async function logoutPlatformSession() {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_SESSION_COOKIE_NAME);
}
