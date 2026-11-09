import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDevUserById } from "@/lib/dev/dev-user-store-mock";
import { prisma } from "@/lib/database/prisma-client";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifySessionToken,
  verifyWorkspaceSupportSessionToken,
  WORKSPACE_SUPPORT_SESSION_COOKIE_NAME,
} from "@/lib/auth/session-token";

export { createSessionToken, SESSION_COOKIE_NAME, signValue, verifySessionToken } from "@/lib/auth/session-token";

export type SessionUser = {
  id: string;
  workspace_id: string;
  profile_name: string;
  full_name: string;
  email: string | null;
  email_verified: boolean;
  mobile_number: string | null;
  mobile_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  supportAccess?: {
    platformAdminName: string;
    platformAdminEmail: string;
    reason: string;
    expiresAt: Date;
  };
};

const USE_DEV_USER_STORE = process.env.USE_DEV_USER_STORE === "true";
const isDevBypass = process.env.NODE_ENV !== "production" && (USE_DEV_USER_STORE || !process.env.DATABASE_URL);

export async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  const token = createSessionToken(userId);

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const supportCookie = cookieStore.get(WORKSPACE_SUPPORT_SESSION_COOKIE_NAME);
  if (supportCookie) {
    const supportSessionId = verifyWorkspaceSupportSessionToken(supportCookie.value);
    if (!supportSessionId) return null;

    const supportSession =
      await prisma.platformWorkspaceUserSupportSession.findUnique({
        where: { id: supportSessionId },
        include: {
          platformAdmin: {
            select: {
              full_name: true,
              email: true,
              role: true,
              is_active: true,
            },
          },
          workspaceUser: {
            select: {
              id: true,
              workspace_id: true,
              profile_name: true,
              full_name: true,
              email: true,
              email_verified: true,
              mobile_number: true,
              mobile_verified_at: true,
              created_at: true,
              updated_at: true,
              last_login_at: true,
            },
          },
        },
      });
    if (
      !supportSession ||
      supportSession.ended_at ||
      supportSession.revoked_at ||
      supportSession.expires_at <= new Date() ||
      !supportSession.platformAdmin ||
      !supportSession.platformAdmin.is_active ||
      supportSession.platformAdmin.role !== "SUPER_ADMIN"
    ) {
      return null;
    }

    return {
      id: supportSession.workspaceUser.id,
      workspace_id: supportSession.workspaceUser.workspace_id,
      profile_name: supportSession.workspaceUser.profile_name,
      full_name: supportSession.workspaceUser.full_name,
      email: supportSession.workspaceUser.email,
      email_verified: supportSession.workspaceUser.email_verified,
      mobile_number: supportSession.workspaceUser.mobile_number,
      mobile_verified_at: supportSession.workspaceUser.mobile_verified_at,
      created_at: supportSession.workspaceUser.created_at,
      updated_at: supportSession.workspaceUser.updated_at,
      last_login_at: supportSession.workspaceUser.last_login_at,
      supportAccess: {
        platformAdminName: supportSession.platformAdmin.full_name,
        platformAdminEmail: supportSession.platformAdmin.email,
        reason: supportSession.reason,
        expiresAt: supportSession.expires_at,
      },
    };
  }

  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);

  if (!userId) {
    return null;
  }

  if (isDevBypass) {
    const devUser = getDevUserById(userId);

    if (!devUser) {
      return null;
    }

    return {
      id: devUser.id,
      workspace_id: devUser.workspace_id,
      profile_name: devUser.profile_name,
      full_name: devUser.full_name,
      email: devUser.email,
      email_verified: devUser.email_verified,
      mobile_number: devUser.mobile_number ?? null,
      mobile_verified_at: devUser.mobile_verified_at ?? null,
      created_at: devUser.created_at,
      updated_at: devUser.updated_at,
      last_login_at: devUser.last_login_at,
    };
  }

  try {
    const user = await prisma.workspaceUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      workspace_id: user.workspace_id,
      profile_name: user.profile_name,
      full_name: user.full_name,
      email: user.email,
      email_verified: user.email_verified,
      mobile_number: user.mobile_number,
      mobile_verified_at: user.mobile_verified_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at,
    };
  } catch {
    return null;
  }
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return user;
}

export async function logoutSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
