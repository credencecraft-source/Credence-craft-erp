import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDevUserById } from "@/lib/dev/dev-user-store-mock";
import { prisma } from "@/lib/database/prisma-client";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, verifySessionToken } from "@/lib/auth/session-token";

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
